# Why these do not run

Both workflows are correct and both fail in three seconds.

On a **private** repository, GitHub-hosted runners draw on the account's
included Actions minutes. With none left, a job is created and then fails
before a runner is ever assigned: `runner_name` empty, zero steps, no logs to
read. It looks like a broken workflow file and is not one — `CLOUDFLARE_API_TOKEN`
and `CLOUDFLARE_ACCOUNT_ID` are both set, Actions are enabled, and the YAML
parses.

They will start working, unchanged, the day either is true:

- the repository becomes public (Actions are free and unlimited there), or
- the account has Actions minutes again.

Until then the rule they existed to enforce — never deploy without running the
tests — lives in `scripts/ship.sh`, which refuses to deploy if anything fails
and verifies the deploy afterwards. Use that.
