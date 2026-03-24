let globalAssigned = [];
let globalReviewed = [];
let globalOrg = '';
let globalProject = '';

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('settingsBtn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    const dashBtn = document.getElementById('openDashboardBtn');
    if (dashBtn) {
        dashBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
        });
    }

    const sortSelect = document.getElementById('sortSelect');
    const { prSortOrder } = await chrome.storage.local.get(['prSortOrder']);
    if (prSortOrder) {
        sortSelect.value = prSortOrder;
    }

    sortSelect.addEventListener('change', async (e) => {
        const order = e.target.value;
        await chrome.storage.local.set({ prSortOrder: order });
        renderSortedLists(order);
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
                pr.myVote = myVote; // Opslaan zodat we het in de tile kunnen renderen
                // vote === 0 betekent "niet afgerond" 
                // in ADO: 10 = approved, 5 = approved with suggestions, -5 = waiting for author, -10 = rejected
                if (myVote === 0 && !isAuthor) {
                    assignedToMe.push(pr);
                } else if (myVote !== 0) {
                    reviewedByMe.push(pr);
                }
            }
        }

        globalAssigned = assignedToMe;
        globalReviewed = reviewedByMe;
        globalOrg = items.adoOrg;
        globalProject = items.adoProject;

        const { prSortOrder } = await chrome.storage.local.get(['prSortOrder']);
        renderSortedLists(prSortOrder || 'recent');

    } catch (e) {
        document.getElementById('content').innerHTML = `
            <div style="padding: 16px; color: #a4262c; text-align: center;">Error fetching PRs. Check your PAT or internet connection: <br><br> ${e.message}</div>
        `;
    }
}

function sortPrs(prs, order) {
    return prs.sort((a, b) => {
        const getUpdatedDate = (pr) => {
            // ADO might not always provide an updated date, so fallback to creationDate
            // if lastMergeCommit.committer.date doesn't exist. We use creationDate as a base.
            let date = pr.creationDate;
            if (pr.lastMergeCommit && pr.lastMergeCommit.committer && pr.lastMergeCommit.committer.date) {
                date = pr.lastMergeCommit.committer.date;
            }
            return new Date(date).getTime();
        };

        const dateA = new Date(a.creationDate).getTime();
        const dateB = new Date(b.creationDate).getTime();

        switch (order) {
            case 'oldest':
                return dateA - dateB;
            case 'newest':
                return dateB - dateA;
            case 'recent':
            default:
                return getUpdatedDate(b) - getUpdatedDate(a);
        }
    });
}

function renderSortedLists(order) {
    const sortedAssigned = sortPrs([...globalAssigned], order);
    const sortedReviewed = sortPrs([...globalReviewed], order);
    renderList('assignedList', 'assignedCount', sortedAssigned, globalOrg, globalProject);
    renderList('reviewedList', 'reviewedCount', sortedReviewed, globalOrg, globalProject);
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

        const formatAdoDate = (d) => {
            if (!d) return 'Unknown';
            const date = new Date(d);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const day = String(date.getDate()).padStart(2, '0');
            const mo = months[date.getMonth()];
            const yr = String(date.getFullYear()).slice(-2);
            const hr = String(date.getHours()).padStart(2, '0');
            const min = String(date.getMinutes()).padStart(2, '0');
            return `${day}-${mo}-${yr} ${hr}:${min}`;
        };

        const sourceBranch = pr.sourceRefName ? pr.sourceRefName.replace('refs/heads/', '') : 'Unknown';
        const targetBranch = pr.targetRefName ? pr.targetRefName.replace('refs/heads/', '') : 'Unknown';
        const createdDate = formatAdoDate(pr.creationDate);

        let updatedDateStr = createdDate;
        if (pr.lastMergeCommit && pr.lastMergeCommit.committer && pr.lastMergeCommit.committer.date) {
            updatedDateStr = formatAdoDate(pr.lastMergeCommit.committer.date);
        }

        item.title = `Source: ${sourceBranch}\nTarget: ${targetBranch}\nCreated: ${createdDate}\nUpdated: ${updatedDateStr}`;

        let voteHtml = '';
        if (pr.myVote !== undefined && pr.myVote !== 0) {
            let voteLabel = '';
            let voteColor = '';
            switch (pr.myVote) {
                case 10: voteLabel = 'Approved'; voteColor = '#107c10'; break;
                case 5: voteLabel = 'Approved w/ suggestions'; voteColor = '#107c10'; break;
                case -5: voteLabel = 'Waiting for author'; voteColor = '#f3541aff'; break;
                case -10: voteLabel = 'Rejected'; voteColor = '#a4262c'; break;
                default: voteLabel = 'Reviewed'; voteColor = '#0078d4'; break;
            }
            voteHtml = `<span style="color: ${voteColor}; font-weight: 500;">${pr.myVote > 0 ? '✓' : '✗'} ${voteLabel}</span>`;
        }

        item.innerHTML = `
            <div class="pr-title">#${pr.pullRequestId} &mdash; ${pr.title}</div>
            <div class="pr-meta">
                <span>By ${pr.createdBy.displayName}</span>
                <span>[${pr.repository.name}]</span>
            </div>
            <div class="pr-meta" style="margin-top: 5px;">
                <span style="color: ${pr.isDraft ? '#d83b01' : '#107c10'}">Status: ${statusText}</span>
                ${voteHtml}
            </div>
        `;
        listEl.appendChild(item);
    });
}
