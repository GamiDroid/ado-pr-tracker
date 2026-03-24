document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('settingsBtn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    await renderPullRequests();
});

async function renderPullRequests() {
    const items = await chrome.storage.local.get(['adoOrg', 'adoProject', 'adoPat', 'adoUserEmail']);
    if (!items.adoOrg || !items.adoProject || !items.adoPat || !items.adoUserEmail) {
        document.getElementById('content').innerHTML = `
            <div style="padding: 16px; text-align: center;">
                <p style="margin-bottom: 15px; color: #d13438;">The extension is not configured yet.</p>
                <button onclick="chrome.runtime.openOptionsPage()" style="background:#0078D4; color:white; border:none; padding:8px 16px; border-radius:4px; font-weight:600; cursor:pointer;">Open Settings</button>
            </div>
        `;
        return;
    }

    const api = new AdoApi(items.adoOrg, items.adoProject, items.adoPat, items.adoUserEmail);
    const myEmail = items.adoUserEmail.toLowerCase();

    try {
        const activePrs = await api.getActivePullRequests();
        
        const assignedToMe = [];
        const reviewedByMe = [];

        for (const pr of activePrs) {
            const isReviewer = pr.reviewers && pr.reviewers.some(r => r.uniqueName.toLowerCase() === myEmail);
            const isAuthor = pr.createdBy && pr.createdBy.uniqueName.toLowerCase() === myEmail;
            
            if (isReviewer) {
                const myVote = pr.reviewers.find(r => r.uniqueName.toLowerCase() === myEmail).vote;
                // vote === 0 betekent "niet afgerond" 
                // in ADO: 10 = approved, 5 = approved with suggestions, -5 = waiting for author, -10 = rejected
                if (myVote === 0 && !isAuthor) {
                    assignedToMe.push(pr);
                } else if (myVote !== 0) {
                    reviewedByMe.push(pr);
                }
            }
        }

        renderList('assignedList', 'assignedCount', assignedToMe, items.adoOrg, items.adoProject);
        renderList('reviewedList', 'reviewedCount', reviewedByMe, items.adoOrg, items.adoProject);

    } catch (e) {
        document.getElementById('content').innerHTML = `
            <div style="padding: 16px; color: #a4262c; text-align: center;">Error fetching PRs. Check your PAT or internet connection: <br><br> ${e.message}</div>
        `;
    }
}

function renderList(listId, countId, prs, org, project) {
    const listEl = document.getElementById(listId);
    document.getElementById(countId).textContent = prs.length;
    
    if (prs.length === 0) {
        listEl.innerHTML = '<div class="no-prs">No pull requests found.</div>';
        return;
    }

    listEl.innerHTML = '';
    prs.forEach(pr => {
        const prUrl = `https://dev.azure.com/${org}/${project}/_git/${pr.repository.name}/pullrequest/${pr.pullRequestId}`;
        
        const item = document.createElement('a');
        item.className = 'pr-item';
        item.href = prUrl;
        item.target = '_blank';
        
        let statusText = pr.status;
        if (pr.isDraft) statusText = 'Draft / Not ready';

        item.innerHTML = `
            <div class="pr-title">#${pr.pullRequestId} &mdash; ${pr.title}</div>
            <div class="pr-meta">
                <span>By ${pr.createdBy.displayName}</span>
                <span>[${pr.repository.name}]</span>
            </div>
            <div class="pr-meta" style="margin-top: 5px; color: ${pr.isDraft ? '#d83b01' : '#107c10'}">
                <span>Status: ${statusText}</span>
            </div>
        `;
        listEl.appendChild(item);
    });
}
