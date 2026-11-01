# Repository workflow

- For any frontend design work, follow [docs/design-system.md](docs/design-system.md). The main page defines the colors, typography, and component style for every screen and admin panel.
- After completing and checking a task in this repository, commit all current repository changes and push the current branch to `origin` automatically. The user explicitly requested this workflow.
- The user handles server restarts and deployment. Agents must not restart or deploy the server after making changes.
- If a later user instruction says otherwise, follow that instruction.
- If commit or push fails, report the exact blocker and leave the repository state intact.
