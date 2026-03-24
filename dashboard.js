document.addEventListener('DOMContentLoaded', async () => {
    await renderDashboard();
});

function formatAdoDate(d) {
    if (!d) return 'Unknown';
    const date = new Date(d);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const day = String(date.getDate()).padStart(2, '0');
    const mo = months[date.getMonth()];
    const yr = String(date.getFullYear()).slice(-2);
    const hr = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${day}-${mo}-${yr} ${hr}:${min}`;
}

async function renderDashboard() {
    const items = await chrome.storage.local.get(['adoOrg', 'adoProject', 'adoPat', 'adoUserEmail']);
    if (!items.adoOrg || !items.adoPat) {
        document.getElementById('loading').textContent = 'Please configure your connection in the settings first.';
        return;
    }

    const api = new AdoApi(items.adoOrg, items.adoProject, items.adoPat, items.adoUserEmail);
    const myEmail = items.adoUserEmail.toLowerCase();

    try {
        const activePrs = await api.getActivePullRequests();
        
        // Filter to only PRs relevant to me (assigned to me, reviewed by me, or created by me)
        const relevantPrs = activePrs.filter(pr => {
            const isReviewer = pr.reviewers && pr.reviewers.some(r => r.uniqueName.toLowerCase() === myEmail);
            const isAuthor = pr.createdBy && pr.createdBy.uniqueName.toLowerCase() === myEmail;
            return isReviewer || isAuthor;
        });

        // We sort them by newest first by default in standard view
        relevantPrs.sort((a,b) => new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime());

        const tbody = document.getElementById('prTableBody');
        
        for (const pr of relevantPrs) {
            // Fetch threads async
            const threads = await api.getPullRequestThreads(pr.repository.id, pr.pullRequestId);
            
            // Calculate active threads (comments)
            let activeComments = 0;
            if (threads && threads.length > 0) {
                // Determine true active status based on ADO logic (thread.status = active or pending)
                activeComments = threads.filter(t => !t.isDeleted && (t.status === 'active' || t.status === 'pending')).length;
            }

            // Calculate dates
            let updatedDateObj = new Date(pr.creationDate);
            if (pr.lastMergeCommit && pr.lastMergeCommit.committer && pr.lastMergeCommit.committer.date) {
                updatedDateObj = new Date(pr.lastMergeCommit.committer.date);
            }
            const updatedTime = updatedDateObj.getTime();
            const now = Date.now();
            const diffDays = Math.floor((now - updatedTime) / (1000 * 60 * 60 * 24));

            let activityBadge = '';
            if (diffDays > 14) {
                activityBadge = `<span class="very-stale-badge">Very Stale (${diffDays}d)</span>`;
            } else if (diffDays > 5) {
                activityBadge = `<span class="stale-badge">Stale (${diffDays}d)</span>`;
            } else if (diffDays === 0) {
                activityBadge = `<span class="fresh-badge">Active Today</span>`;
            } else {
                activityBadge = `<span class="fresh-badge">Active (${diffDays}d ago)</span>`;
            }

            let commentBadge = '';
            if (activeComments > 0) {
                commentBadge = `<span class="comment-count comments-danger">${activeComments} open</span>`;
            } else {
                commentBadge = `<span class="comment-count comments-good">All resolved</span>`;
            }

            const tr = document.createElement('tr');
            
            const prUrl = `https://dev.azure.com/${items.adoOrg}/${items.adoProject}/_git/${pr.repository.name}/pullrequest/${pr.pullRequestId}`;

            tr.innerHTML = `
                <td><strong>#${pr.pullRequestId}</strong></td>
                <td>
                    <a href="${prUrl}" target="_blank" class="pr-link">${pr.title}</a>
                    <div class="repo-name">${pr.repository.name}</div>
                </td>
                <td>${pr.createdBy.displayName}</td>
                <td>${activityBadge}</td>
                <td>${commentBadge}</td>
                <td>${formatAdoDate(pr.creationDate)}</td>
                <td>${formatAdoDate(updatedDateObj)}</td>
            `;

            tbody.appendChild(tr);
        }

        document.getElementById('loading').classList.add('hidden');
        document.getElementById('prTable').classList.remove('hidden');

    } catch (e) {
        document.getElementById('loading').textContent = `Failed to load dashboard data: ${e.message}`;
    }
}
