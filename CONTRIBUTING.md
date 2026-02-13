# Contributing to GigClaw

Thank you for your interest in contributing to GigClaw! This document provides guidelines for contributing to the project.

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code:
- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Respect different viewpoints and experiences

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report, please:
1. Check if the issue already exists
2. Use the latest version to verify the bug still exists
3. Collect information about the bug (error messages, environment, etc.)

When creating a bug report, include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, network)
- Relevant code snippets or logs

### Suggesting Features

Feature requests are welcome! Please:
1. Check if the feature has already been suggested
2. Provide clear use case and benefits
3. Explain how it fits the project vision

### Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting
5. Commit with clear messages (`git commit -m 'feat: add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Development Setup

### Prerequisites

- Node.js 20+
- npm or yarn
- Solana CLI (for blockchain development)
- Anchor CLI (for program development)

### Installation

```bash
# Clone the repository
git clone https://github.com/OmaClaw/gigclaw.git
cd gigclaw

# Install root dependencies
npm install

# Install API dependencies
cd api && npm install

# Install contract dependencies
cd ../contracts && npm install
```

### Running Locally

```bash
# Start the API
cd api
npm run dev

# Run tests
cd contracts
anchor test
```

## Style Guidelines

### TypeScript/JavaScript

- Use TypeScript for type safety
- Follow ESLint configuration
- Use async/await over promises
- Comment complex logic
- Use meaningful variable names

### Rust (Anchor Programs)

- Follow Rust naming conventions
- Document all public functions
- Use proper error handling
- Add security considerations in comments

### Git Commit Messages

We use conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Build process or auxiliary tool changes

Example:
```
feat: add reputation decay calculation

- Implement exponential decay formula
- Add tests for decay accuracy
- Update documentation
```

## Testing

- Write unit tests for new functionality
- Ensure integration tests pass
- Test on devnet before mainnet
- Verify security implications

## Documentation

- Update README.md if adding features
- Document API changes
- Update CHANGELOG.md
- Add inline code comments for complex logic

## Security

If you discover a security vulnerability:
1. **DO NOT** open a public issue
2. Email security concerns to: [security contact]
3. Allow time for the issue to be resolved before public disclosure

## Questions?

- Open a discussion on GitHub
- Join our community forum
- Check existing documentation

## Recognition

Contributors will be recognized in our README and release notes.

Thank you for contributing to GigClaw! 🦞
