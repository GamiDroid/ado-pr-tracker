importScripts('services/adoApi.js');

const ALARM_NAME = 'ado-pr-poll';
const ICON_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    // Run directly on install/update for quick feedback
    pollAdoPrs();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    await pollAdoPrs();
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
            
            const prId = String(pr.pullRequestId);
            const myVote = pr.reviewers.find(r => r.uniqueName.toLowerCase() === myEmail).vote;
            const isDraft = pr.isDraft || false;
            const lastCommitId = pr.lastMergeCommit ? pr.lastMergeCommit.commitId : null;
            
            newState[prId] = {
                title: pr.title,
                status: pr.status,
                isDraft: isDraft,
                lastCommitId: lastCommitId,
                vote: myVote
            };

            const oldPr = oldState[prId];

            if (!oldPr) {
                // Feature A: New PR assigned to me
                showNotification(`pr_new_${prId}`, 'New PR Assigned', `The PR "${pr.title}" has been assigned to you.`);
            } else {
                // Feature B: Update performed on a PR I reviewed.
                // We check if we cast a vote in the past (vote !== 0).
                const iVotedBefore = oldPr.vote !== 0; 
                if (iVotedBefore && lastCommitId !== oldPr.lastCommitId && oldPr.lastCommitId !== null) {
                    showNotification(`pr_upd_${prId}`, 'PR Updated', `New commits pushed to the PR "${pr.title}" that you reviewed.`);
                }
                
                // Feature C: Author indicated the PR is ready
                // Option 1: The author takes the PR out of draft (`isDraft` false) after it was in draft.
                if (oldPr.isDraft && !isDraft) {
                    showNotification(`pr_ready_${prId}`, 'PR is Ready (Out of Draft)', `The PR "${pr.title}" is ready for review.`);
                }
            }
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
        iconUrl: ICON_BASE64, // Placeholder icon
        title: title,
        message: message,
        priority: 2,
        requireInteraction: true // Notificatie blijft staan totdat gebruiker hem wegklikt
    });
}
