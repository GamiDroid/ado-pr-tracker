importScripts('services/adoApi.js');

const ALARM_NAME = 'ado-pr-poll';

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    // Run directly on install/update for quick feedback
    pollAdoPrs();
});

// Initialize badge immediately when background script wakes up
chrome.storage.local.get(['prState']).then(items => {
    if (items.prState) {
        updateBadgeFromState(items.prState);
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    await pollAdoPrs();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'NOTIFY_REVIEWERS') {
        const { repoId, prId } = request;
        chrome.storage.local.get(['adoOrg', 'adoProject', 'adoPat', 'adoUserEmail'])
            .then(items => {
                if (!items.adoOrg || !items.adoPat) {
                    sendResponse({ success: false, error: 'Not configured' });
                    return;
                }
                const api = new AdoApi(items.adoOrg, items.adoProject, items.adoPat, items.adoUserEmail);

                const message = "🔔 Review Requested: The author has indicated that this PR is ready for review again.";

                api.addPullRequestThread(repoId, prId, message)
                    .then(success => sendResponse({ success }))
                    .catch(err => sendResponse({ success: false, error: err.message }));
            });
        return true;
    }
});

async function pollAdoPrs() {
    const items = await chrome.storage.local.get(['adoOrg', 'adoProject', 'adoPat', 'adoUserEmail', 'prState']);
    if (!items.adoOrg || !items.adoProject || !items.adoPat || !items.adoUserEmail) {
        return; // Not configured yet
    }

    const api = new AdoApi(items.adoOrg, items.adoProject, items.adoPat, items.adoUserEmail);
    const oldState = items.prState || {};
    const newState = {};
    const myEmail = items.adoUserEmail.toLowerCase();

    try {
        const activePrs = await api.getActivePullRequests();

        for (const pr of activePrs) {
            const isReviewer = pr.reviewers && pr.reviewers.some(r => r.uniqueName.toLowerCase() === myEmail);
            if (!isReviewer) continue; // Only check PRs where I am responsible as a reviewer

            const isAuthor = pr.createdBy && pr.createdBy.uniqueName.toLowerCase() === myEmail;
            const prId = String(pr.pullRequestId);
            const myVote = pr.reviewers.find(r => r.uniqueName.toLowerCase() === myEmail).vote;
            const isDraft = pr.isDraft || false;
            const lastCommitId = pr.lastMergeCommit ? pr.lastMergeCommit.commitId : null;

            let lastThreadId = 0;
            let reviewRequestedNewly = false;
            try {
                const threads = await api.getPullRequestThreads(pr.repository.id, pr.pullRequestId);
                if (threads && threads.length > 0) {
                    for (const thread of threads) {
                        if (thread.id > lastThreadId) lastThreadId = thread.id;

                        if (thread.comments && thread.comments.length > 0) {
                            const latestComment = thread.comments[thread.comments.length - 1];
                            if (latestComment.content && latestComment.content.includes("🔔 Review Requested")) {
                                const oldPrThreadId = (oldState[prId] && oldState[prId].lastThreadId) || 0;
                                if (!oldState[prId] || thread.id > oldPrThreadId) {
                                    reviewRequestedNewly = true;
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('Failed fetching threads for PR', prId, err);
            }

            const oldPr = oldState[prId];
            let isNewOrUpdated = false;

            if (!oldPr) {
                isNewOrUpdated = true;
                // Feature A: New PR assigned to me
                showNotification(`pr_new_${prId}`, 'New PR Assigned', `The PR "${pr.title}" has been assigned to you.`);
            } else {
                // Feature B: Update performed on a PR I reviewed.
                // We check if we cast a vote in the past (vote !== 0).
                const iVotedBefore = oldPr.vote !== 0;
                if (iVotedBefore && lastCommitId !== oldPr.lastCommitId && oldPr.lastCommitId !== null) {
                    isNewOrUpdated = true;
                    showNotification(`pr_upd_${prId}`, 'PR Updated', `New commits pushed to the PR "${pr.title}" that you reviewed.`);
                }

                // Feature C: Author indicated the PR is ready
                // Option 1: The author takes the PR out of draft (`isDraft` false) after it was in draft.
                if (oldPr.isDraft && !isDraft) {
                    isNewOrUpdated = true;
                    showNotification(`pr_ready_${prId}`, 'PR is Ready (Out of Draft)', `The PR "${pr.title}" is ready for review.`);
                }

                if (reviewRequestedNewly) {
                    isNewOrUpdated = true;
                    showNotification(`pr_notify_${prId}_${lastThreadId}`, 'Pending Review', `The author has requested you to review the PR "${pr.title}".`);
                }
            }

            newState[prId] = {
                title: pr.title,
                status: pr.status,
                isDraft: isDraft,
                lastCommitId: lastCommitId,
                lastThreadId: lastThreadId,
                vote: myVote,
                isAuthor: isAuthor,
                url: `https://dev.azure.com/${items.adoOrg}/${items.adoProject}/_git/${pr.repository.name}/pullrequest/${prId}`,
                seen: isNewOrUpdated ? false : (oldPr ? oldPr.seen : false)
            };
        }

        // Save the current status to compare on the next run.
        await chrome.storage.local.set({ prState: newState });

    } catch (error) {
        console.error('Error polling ADO PRs:', error);
    }
}

function showNotification(id, title, message) {
    chrome.notifications.create(id, {
        type: 'basic',
        iconUrl: 'icon128.png',
        title: title,
        message: message,
        priority: 2,
        requireInteraction: true // Notificatie blijft staan totdat gebruiker hem wegklikt
    });
}

chrome.notifications.onClicked.addListener(async (notificationId) => {
    // Extract prId from the notification ID (e.g., "pr_new_12345" or "pr_notify_12345_678")
    const match = notificationId.match(/pr_.*?_(\d+)/);
    if (!match) return;

    const prId = match[1];
    const { prState } = await chrome.storage.local.get(['prState']);

    if (prState && prState[prId]) {
        const pr = prState[prId];

        // Open the PR in a new tab
        if (pr.url) {
            chrome.tabs.create({ url: pr.url });
        }

        // Mark as seen and update the badge
        pr.seen = true;
        await chrome.storage.local.set({ prState });
    }

    // Close the notification
    chrome.notifications.clear(notificationId);
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.prState) {
        updateBadgeFromState(changes.prState.newValue);
    }
});

function updateBadgeFromState(prState) {
    if (!prState) {
        chrome.action.setBadgeText({ text: '' });
        return;
    }

    let openCount = 0;
    let hasUnseen = false;

    for (const prId in prState) {
        const pr = prState[prId];
        if (pr.vote === 0 && !pr.isAuthor) {
            openCount++;
            if (!pr.seen) {
                hasUnseen = true;
            }
        }
    }

    if (openCount > 0) {
        chrome.action.setBadgeText({ text: openCount.toString() });
        chrome.action.setBadgeBackgroundColor({ color: hasUnseen ? '#d13438' : '#0078D4' });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}
