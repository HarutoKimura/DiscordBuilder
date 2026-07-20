Run the repository's `$adversarial-review` skill in review-only mode against
this pull request. Do not fix files, commit, push, or post to GitHub yourself.

Follow the skill's split-context requirement exactly: create the review diff,
run both independent reviewer agents to completion, merge and verify their
findings, and return the final report as your last message. The workflow posts
that message to the pull request from a separate job.

This is a non-interactive CI run. Do not finish while either reviewer is still
running. The ordinary CI workflow handles typechecking and unit tests; this job
is exclusively the independent adversarial review.
