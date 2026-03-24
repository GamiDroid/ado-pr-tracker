# Azure DevOps PR Tracker

A Chrome Extension to keep track of your active Azure DevOps Pull Requests and receive native desktop notifications for assignments, updates, and reviews.

## Installation

This extension can be installed locally as an "unpacked extension" in Google Chrome, Microsoft Edge, or other Chromium-based browsers.

### Prerequisites
- A Chromium-based browser.
- A valid **Azure DevOps Personal Access Token (PAT)** with at least "Pull Request (Read & Write)" permissions.

### Steps to Install

1. Open your browser (Google Chrome or Microsoft Edge).
2. In the address bar, type `chrome://extensions/` (or `edge://extensions/` for Edge) and press Enter.
3. Turn on the **Developer mode** toggle switch. This is usually located in the top-right corner of the Extensions page (or bottom-left in Edge).
4. Click the **Load unpacked** button that appears in the top-left area.
5. In the file dialog, navigate to and select the folder where the source code of this extension is located (the folder that contains the `manifest.json` file).
6. The extension is now successfully installed! You should see the Azure DevOps PR Tracker card on your extensions page.

### Configuration

To make the extension work, it needs to be configured with your Azure DevOps details:

1. Click on the extension icon (puzzle piece) in your browser toolbar. It's recommended to **pin** the Azure DevOps PR Tracker to your toolbar for fast access.
2. Click the extension icon. It will indicate that configuration is required.
3. Open the **Settings** page via the popup.
4. Fill in the following details:
   - **Azure DevOps Organization Name**
   - **Project Name**
   - **Your Azure DevOps Email Address** (Used to identify your assignments and votes)
   - **Personal Access Token (PAT)**
5. Click **Save**.

The extension will now automatically start polling your PRs every minute in the background and populating your popup dashboard!
