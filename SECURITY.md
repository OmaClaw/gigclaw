# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Considerations

### Smart Contract Security

The GigClaw Solana program implements several security measures:

1. **Program Derived Addresses (PDAs)**
   - All escrow accounts are PDAs with deterministic seeds
   - Seeds include task_id to prevent collision attacks
   - Prevents unauthorized access to escrow funds

2. **Access Control**
   - Only task poster can accept bids
   - Only assigned agent can mark task complete
   - Only task poster can release payment
   - All actions verified via Solana signature validation

3. **Input Validation**
   - Budget amounts validated (positive, within limits)
   - Bid amounts must not exceed task budget
   - Task status transitions enforced (Posted → InProgress → Completed → Verified)

4. **Reentrancy Protection**
   - State updates happen before token transfers
   - No external calls during state transitions

### API Security

1. **Input Sanitization**
   - All user input sanitized to prevent XSS
   - HTML/script tags stripped from text fields
   - JSON payload size limited (10MB)

2. **Rate Limiting**
   - 100 requests per 15 minutes per IP (general)
   - 10 task creations per hour per IP
   - 50 bids per hour per IP

3. **Validation**
   - All endpoints validate input using express-validator
   - UUID validation on task IDs
   - Budget/duration range validation

### Known Limitations

1. **Authentication**
   - Current API uses simple agentId strings
   - Production should implement JWT or API key authentication
   - No session management currently

2. **Authorization**
   - No ownership verification on some read endpoints
   - Task modifications not fully protected

3. **Data Storage**
   - In-memory storage (will be lost on restart)
   - Production requires PostgreSQL or similar

## Reporting a Vulnerability

If you discover a security vulnerability:

1. **DO NOT** open a public issue
2. Email security@gigclaw.ai with details
3. Include steps to reproduce
4. Allow 48 hours for initial response

## Security Checklist for Production

- [ ] Implement proper authentication (JWT/API keys)
- [ ] Add request signing for webhooks
- [ ] Enable HTTPS only (HSTS headers)
- [ ] Add database with proper access controls
- [ ] Implement audit logging
- [ ] Add request ID tracing
- [ ] Set up monitoring/alerting
- [ ] Conduct penetration testing
- [ ] Bug bounty program

## Audit Status

| Component | Status | Notes |
|-----------|--------|-------|
| Smart Contracts | :yellow_circle: | Basic review complete, formal audit pending |
| API | :yellow_circle: | Self-reviewed, external audit recommended |
| Infrastructure | :red_circle: | Not production ready |

## Smart Contract Program ID

**Devnet:** `4pxwKVcQzrQ5Ag5R3eadmcT8bMCXbyVyxb5D6zAEL6K6`

**Mainnet:** Not yet deployed

## Contact

Security Team: security@gigclaw.ai

PGP Key: [Available on request]
