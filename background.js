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
        return; // Nog niet geconfigureerd
    }

    const api = new AdoApi(items.adoOrg, items.adoProject, items.adoPat, items.adoUserEmail);
    const oldState = items.prState || {};
    const newState = {};
    const myEmail = items.adoUserEmail.toLowerCase();

    try {
        const activePrs = await api.getActivePullRequests();
        
        for (const pr of activePrs) {
            const isReviewer = pr.reviewers && pr.reviewers.some(r => r.uniqueName.toLowerCase() === myEmail);
            if (!isReviewer) continue; // Alleen PR's checken waar ik verantwoordelijk voor ben als reviewer
            
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
                // Feature A: Nieuwe PR aan mij toegekend
                showNotification(`pr_new_${prId}`, 'Nieuwe PR toegekend', `De PR "${pr.title}" is aan jou toegekend.`);
            } else {
                // Feature B: Update uitgevoerd op een PR waar ik een review op heb gemaakt.
                // We checken of we in het verleden een vote hebben doorgegeven (vote !== 0).
                const iVotedBefore = oldPr.vote !== 0; 
                if (iVotedBefore && lastCommitId !== oldPr.lastCommitId && oldPr.lastCommitId !== null) {
                    showNotification(`pr_upd_${prId}`, 'PR Geüpdatet', `Nieuwe commits gepushed naar de PR "${pr.title}" die jij had gereviewd.`);
                }
                
                // Feature C: Author heeft aangegeven dat de PR klaar is
                // Optie 1: De auteur haalt de PR uit draft (`isDraft` false) nadat het in draft stond.
                if (oldPr.isDraft && !isDraft) {
                    showNotification(`pr_ready_${prId}`, 'PR is Klaar (Uit Draft)', `De PR "${pr.title}" is gereed voor review.`);
                }
            }
        }
        
        // Sla de actuele status weer op, om bij de volgende run te vergelijken.
        await chrome.storage.local.set({ prState: newState });

    } catch (error) {
        console.error('Fout bij pollen van ADO PRs:', error);
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
