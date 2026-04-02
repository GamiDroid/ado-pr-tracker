class AdoApi {
    constructor(org, project, pat, email) {
        this.org = org;
        this.project = project;
        this.pat = pat;
        this.email = email;
        this.baseUrl = `https://dev.azure.com/${org}/${project}/_apis/git`;
    }

    getHeaders() {
        return {
            'Authorization': `Basic ${btoa(':' + this.pat)}`,
            'Content-Type': 'application/json'
        };
    }

    async getActivePullRequests() {
        // Gebruikt $top=200 om zeker te zijn dat we alle actieve PR's kunnen itereren.
        const url = `${this.baseUrl}/pullrequests?searchCriteria.status=active&api-version=7.1&$top=200`;
        const response = await fetch(url, { headers: this.getHeaders() });

        if (!response.ok) {
            throw new Error(`Error fetching PRs: ${response.status}`);
        }

        const data = await response.json();
        return data.value;
    }

    async getMyReviewPullRequests() {
        const prs = await this.getActivePullRequests();
        const emailLower = this.email.toLowerCase();

        // Filter PRs where the user is listed as a reviewer
        return prs.filter(pr => {
            if (!pr.reviewers) return false;
            return pr.reviewers.some(reviewer =>
                reviewer.uniqueName && reviewer.uniqueName.toLowerCase() === emailLower
            );
        });
    }

    async getPullRequestThreads(repositoryId, pullRequestId) {
        const url = `${this.baseUrl}/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads?api-version=7.1`;
        const response = await fetch(url, { headers: this.getHeaders() });

        if (!response.ok) {
            console.error(`Failed to fetch threads for PR ${pullRequestId}`);
            return [];
        }

        const data = await response.json();
        return data.value;
    }

    async addLabelToPullRequest(repositoryId, pullRequestId, labelName) {
        const url = `${this.baseUrl}/repositories/${repositoryId}/pullRequests/${pullRequestId}/labels?api-version=7.1`;
        const body = { name: labelName };

        const response = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(body)
        });

        return response.ok;
    }

    async addPullRequestThread(repositoryId, pullRequestId, message) {
        const url = `${this.baseUrl}/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads?api-version=7.1`;
        const body = {
            comments: [
                {
                    parentCommentId: 0,
                    content: message,
                    commentType: 1 // text
                }
            ],
            status: 1 // active
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(body)
        });

        return response.ok;
    }
}
