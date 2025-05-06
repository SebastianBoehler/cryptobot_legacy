# Cryptobot Legacy

**Legacy Version** of an automated cryptocurrency trading bot with backtesting, multi-exchange support, AI-driven chat assistant, and payment integration.

---

## 🔍 Overview

CryptoBot is a full-featured trading framework originally built in TypeScript and Python. It supports strategy backtesting, live trading across major exchanges, AI chat for insights, and Stripe-based payment flows.

## ⚙️ Features

- **Backtester**: Historical simulation via `backtester.ts` & `backtest.ts`.
- **Exchange Integrations**: Bybit, dYdX, Kraken, OKX, Solana.
- **Strategy Framework**: Modular strategies under `src/strategies/`.
- **Agent & Worker**: Python agent (`agent.py`) and worker processes.
- **Chat Assistant**: AI-driven chat using Vertex AI & GCS docstore (`src/chat/`).
- **Payment Routes**: Stripe API endpoints in `src/stripe/`.
- **Deployment**: PM2 & Docker support (`dockerfile`, `ecosystem.config.js`).

## 📁 Project Structure

```
├── .gitignore
├── dockerfile
├── ecosystem.config.js
├── package.json
├── tsconfig.json
├── project.yml
├── src/
│   ├── agent.py
│   ├── backtest.ts
│   ├── backtester.ts
│   ├── chat/
│   │   └── tools.ts
│   ├── config/        # Env defaults & configs
│   ├── strategies/    # Trading strategies
│   ├── bybit/ dydx/ kraken/ okx/ solana/
│   ├── server.ts      # HTTP server & routes
│   └── stripe/        # Stripe webhook & payment routes
└── venv/              # Python virtual environment
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v16+) & Bun or Yarn
- Python 3.8+ & virtualenv

### Installation

1. **Clone**

   ```bash
   git clone https://github.com/your-username/cryptobot_legacy.git
   cd cryptobot_legacy
   ```

## 📝 Notes

- **Legacy**: This version is no longer under active development.
- **Secrets**: All API keys and credentials have been scrubbed from history and revoked.

---

_Feel free to explore this codebase and adapt it for your own projects!_
