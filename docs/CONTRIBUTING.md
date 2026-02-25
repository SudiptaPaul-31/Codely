# Contributing to Codely

Thank you for your interest in contributing to **Codely** — a Stellar-powered code snippet management platform! We appreciate your help in making this project better.


## Code of Conduct

We are committed to fostering a welcoming and inclusive community. All contributors are expected to:

- Be respectful and constructive in all communications
- Welcome feedback and different perspectives
- Focus on what is best for the community
- Show empathy toward other community members

Unacceptable behavior includes harassment, discrimination, insulting comments, personal attacks, and spam. Please report any concerns to the maintainers.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm package manager
- Git
- PostgreSQL (via NeonDB)
- Stellar testnet wallet (for blockchain features)

### Fork and Clone

1. **Fork the repository** by clicking the "Fork" button on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/Codely.git
   cd Codely
   ```
3. **Add upstream remote** to stay synced with the main repository:
   ```bash
   git remote add upstream https://github.com/SudiptaPaul-31/Codely.git
   ```

---

## Development Setup

### 1. Install Dependencies

```bash
npm install
# or
pnpm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"

# Stellar
NEXT_PUBLIC_STELLAR_NETWORK=testnet
STELLAR_SECRET_KEY=your_stellar_secret_key_here

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Setup Database

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# (Optional) Seed the database
npx prisma db seed
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Making Changes

### Branch Naming Convention

Create branches with descriptive names following this pattern:

- **Features**: `feature/description` (e.g., `feature/dark-mode-support`)
- **Bug Fixes**: `fix/description` (e.g., `fix/snippet-edit-crash`)
- **Documentation**: `docs/description` (e.g., `docs/update-readme`)
- **Refactoring**: `refactor/description` (e.g., `refactor/api-structure`)
- **Tests**: `test/description` (e.g., `test/snippet-validation`)

Example:

```bash
git checkout -b feature/snippet-search
```

### Keep Your Fork Synced

Before starting work or submitting a PR, sync with the main repository:

```bash
git fetch upstream
git rebase upstream/main
```

---

## Commit Guidelines

We follow **Conventional Commits** for clear and organized commit history.

### Commit Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, semicolons, etc.)
- **refactor**: Code refactoring without feature changes
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Build, dependencies, or configuration changes

### Scope (Optional)

- `api`: Backend/API changes
- `ui`: Frontend/UI changes
- `db`: Database/Prisma changes
- `stellar`: Stellar blockchain integration
- `auth`: Authentication features

### Examples

```
feat(ui): add dark mode toggle to settings
fix(api): resolve snippet deletion endpoint timeout
docs(readme): update installation instructions
refactor(db): optimize snippet query performance
test(stellar): add wallet connection tests
```

### Writing Good Commits

- Keep commits atomic and focused on a single change
- Write clear, descriptive messages
- Reference related issues: `fixes #123`
- Explain the "why" in the commit body, not just the "what"

Example:

```
feat(snippet): add one-click copy functionality

Users can now copy code snippets with a single click button.
This improves the user experience and reduces friction.

Implements copy-to-clipboard API with fallback for older browsers.
Adds toast notification feedback after successful copy.

fixes #45
```

---

## Submitting Pull Requests

### Before Submitting

1. **Test your changes locally** with `npm run dev`
2. **Run linting and formatting** (if configured):
   ```bash
   npm run lint
   npm run format
   ```
3. **Update tests** if you modified existing functionality
4. **Update documentation** (README, inline comments, etc.)
5. **Sync with upstream** to avoid conflicts:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

### PR Title and Description

**Title**: Follow conventional commit format

```
feat(ui): add syntax highlighting for code snippets
```

**Description**: Use this template:

```markdown
## Description
Brief explanation of what this PR does.

## Related Issue
fixes #123

## Type of Change
- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change
- [ ] Documentation update

## Changes Made
- Specific change 1
- Specific change 2
- Specific change 3

## Testing
How to test these changes:
1. Step 1
2. Step 2
3. Step 3

## Screenshots (if applicable)
Add screenshots for UI changes.

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Changes reviewed locally
```

### Pushing Your Branch

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

---

## Code Standards

### TypeScript

- Use **strict mode**: `"strict": true` in tsconfig.json
- Define types explicitly; avoid `any`
- Use interfaces for object shapes
- Example:

```typescript
interface Snippet {
  id: string;
  title: string;
  language: string;
  code: string;
  owner?: string;
  createdAt: Date;
}
```

### React/Next.js

- Use **functional components** with hooks
- Use **Server Components** when possible
- Keep components small and focused
- Use **TypeScript** for all component props:

```typescript
interface SnippetCardProps {
  snippet: Snippet;
  onEdit: (id: string) => void;
}

export function SnippetCard({ snippet, onEdit }: SnippetCardProps) {
  return <div>{/* JSX */}</div>;
}
```

### Styling

- Use **Tailwind CSS** for styling
- Follow the existing design system
- Avoid inline styles
- Use CSS variables for theme colors

### Database

- Use **Prisma** for all database operations
- Write migrations for schema changes:
  ```bash
  npx prisma migrate dev --name add_feature_name
  ```
- Use **relations** instead of manual joins
- Keep queries optimized and indexed

### Stellar Integration

- Handle wallet connections gracefully
- Validate Stellar addresses before use
- Add error handling for blockchain operations
- Test with testnet before production

---

## Reporting Issues

### Creating a Bug Report

1. **Check existing issues** to avoid duplicates
2. **Use the bug report template** on GitHub
3. **Include details**:
   - Description of the bug
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots/logs if applicable
   - Environment (OS, Node version, browser, etc.)

### Suggesting Features

1. **Search existing issues** for similar suggestions
2. **Use the feature request template**
3. **Explain the use case** and why it would be valuable
4. **Provide examples** or mockups if applicable

---

## Getting Help

- **Discussions**: Ask questions in GitHub Discussions
- **Issues**: Report bugs or request features
- **Documentation**: Check the [README](./README.md) and inline code comments

---

## Recognition

We recognize and appreciate all contributors! Your contributions help make Codely better for everyone.
---

Happy coding! 🚀
