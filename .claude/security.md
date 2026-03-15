# Security

Purpose: This file establishes the security rules and best practices for the project. **Highest precedence** — overrides all other context files.

---

## 0. Baseline Best Practices

- **Never Hardcode Secrets:** Never write API keys, passwords, or other secrets directly in source code.
- **Use a `.gitignore` file:** Must include entries for `.env`, `.env.local`, `*.pem`, `credentials.json`, and any files containing secrets.
- **Use Environment Variables:** Load secrets from environment variables. Use `.env` files for local development only.
- **Principle of Least Privilege:** Create API keys and credentials with minimum necessary permissions.

---

## 1. Data Sensitivity Level

- **My Project's Data is:** [To be classified — Public, Internal, Confidential, Sensitive/PII]

---

## 2. Authentication & Authorization

- **Authentication Method:** [To be defined]
- **Authorization Rules:** [To be defined]

---

## 3. Dependency & Supply Chain Security

- **How We Check Dependencies:** [To be defined — e.g., npm audit, GitHub Dependabot, manual review]
- **Rule for Adding New Dependencies:** [To be defined — e.g., must be reviewed for security and maintenance status]

---

## 4. Secrets Management

- **Where Secrets are Stored:** [To be defined]
- **Who Has Access to Secrets:** [To be defined]
