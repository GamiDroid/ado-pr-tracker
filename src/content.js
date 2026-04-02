function injectButton() {

    if (document.getElementById('ado-pr-notify-btn')) return;

    // Check if we are on a PR page
    if (!window.location.pathname.toLowerCase().includes('/pullrequest/')) return;

    // Extract prId and repoId from URL
    const match = window.location.pathname.match(/_git\/([^\/]+)\/pullrequest\/(\d+)/i);
    if (!match) return;
    const repoId = decodeURIComponent(match[1]);
    const prId = match[2];

    const btn = document.createElement('button');
    btn.id = 'ado-pr-notify-btn';
    btn.className = 'ado-pr-notify-btn';
    btn.innerHTML = '<span>🔔</span> Notify Reviewers';

    btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Sending...';

        chrome.runtime.sendMessage({
            action: 'NOTIFY_REVIEWERS',
            repoId: repoId,
            prId: prId
        }, (response) => {
            if (response && response.success) {
                btn.innerHTML = '<span>✅</span> Sent!';
                setTimeout(() => {
                    btn.innerHTML = '<span>🔔</span> Notify Reviewers';
                    btn.disabled = false;
                }, 3000);
            } else {
                btn.innerHTML = '<span>❌</span> Failed';
                console.error(response ? response.error : 'Unknown error');
                setTimeout(() => {
                    btn.innerHTML = '<span>🔔</span> Notify Reviewers';
                    btn.disabled = false;
                }, 3000);
            }
        });
    });

    document.body.appendChild(btn);
}

// Observe URL changes (SPA navigations)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        injectButton();
    } else {
        // If button was removed by React re-render, re-inject
        if (window.location.pathname.toLowerCase().includes('/pullrequest/') && !document.getElementById('ado-pr-notify-btn')) {
            injectButton();
        }
    }
}).observe(document, { subtree: true, childList: true });

// Initial check
injectButton();
