# Assudani WA Manager Backend

This is the high-performance backend service for Assudani WA Manager. It provides RESTful APIs, real-time Socket.IO events, direct WhatsApp Web QR multi-device engine (Baileys), and webhook handling for managing WhatsApp campaigns, contacts, media, and real-time messaging using both the official WhatsApp Cloud API and linked WhatsApp Web sessions.

## Features

- **Dual WhatsApp Engines:**
  - **WhatsApp Web QR Engine:** Scan QR from mobile WhatsApp (Linked Devices) to send unrestricted messages with no 24-hour template limits.
  - **Meta Cloud API Engine:** Official Meta Cloud API integration for template broadcasts, marketing campaigns, and business messaging.
- **External Project Integration API:** Dedicated `/api/qr-session/send-message` endpoint allowing external apps, services, and scripts to send messages.
- **Frontend .env Configurator:** Update and upload WhatsApp environment credentials safely from the frontend panel.
- **Real-time Live Chat:** Socket.IO enabled messaging for instant inbound and outbound synchronization.
- **PostgreSQL / Supabase Database Support:** Contact lists, broadcast tracking, and message history.

## Setup Instructions

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Environment Configuration:**
   Copy `.env.example` to `.env` or configure via the frontend panel under WhatsApp Manager.
   ```bash
   cp .env.example .env
   ```

3. **Run the backend:**
   ```bash
   npm run dev
   ```
   Server listens on `http://localhost:5001`.
