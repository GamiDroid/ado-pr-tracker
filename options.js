document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);

function saveOptions() {
    const orgName = document.getElementById('orgName').value.trim();
    const projectName = document.getElementById('projectName').value.trim();
    const patToken = document.getElementById('patToken').value.trim();
    const userEmail = document.getElementById('userEmail').value.trim();

    chrome.storage.local.set({
        adoOrg: orgName,
        adoProject: projectName,
        adoPat: patToken,
        adoUserEmail: userEmail
    }, () => {
        const status = document.getElementById('statusMessage');
        status.textContent = 'Instellingen succesvol opgeslagen.';
        status.style.color = 'green';
        setTimeout(() => {
            status.textContent = '';
        }, 3000);
    });
}

function restoreOptions() {
    chrome.storage.local.get(['adoOrg', 'adoProject', 'adoPat', 'adoUserEmail'], (items) => {
        if (items.adoOrg) document.getElementById('orgName').value = items.adoOrg;
        if (items.adoProject) document.getElementById('projectName').value = items.adoProject;
        if (items.adoPat) document.getElementById('patToken').value = items.adoPat;
        if (items.adoUserEmail) document.getElementById('userEmail').value = items.adoUserEmail;
    });
}
