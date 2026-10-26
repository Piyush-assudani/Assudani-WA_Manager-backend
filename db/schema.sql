-- WP Automation Database Schema
-- Run with: npm run migrate

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUM Types
-- ============================================

DO $$ BEGIN
  CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'read', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- Contacts Table
-- ============================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(255),
  city VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_city ON contacts(city);

-- Seed Default Users
INSERT INTO users (username, password, role)
VALUES 
  ('admin', 'Qwerty@123&123%', 'admin'),
  ('moxrathore', 'Qwerty@123&123%', 'admin')
ON CONFLICT (username) DO NOTHING;


-- ============================================
-- Contact Lists (Saved Excel Sheets)
-- ============================================

CREATE TABLE IF NOT EXISTS contact_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  file_url VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Contact List Members
-- ============================================

CREATE TABLE IF NOT EXISTS contact_list_members (
  list_id UUID NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (list_id, contact_id)
);

-- ============================================
-- Campaigns Table
-- ============================================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  contact_list_id UUID REFERENCES contact_lists(id) ON DELETE SET NULL,
  media_id VARCHAR(255),
  media_type VARCHAR(50),
  media_url VARCHAR(255),
  total_sent INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Messages Table (Inbound & Outbound)
-- ============================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  direction message_direction NOT NULL,
  message_body TEXT,
  media_url VARCHAR(255),
  meta_message_id VARCHAR(255),
  status message_status DEFAULT 'sent',
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_campaign ON messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(contact_id, direction, timestamp);

-- ============================================
-- Media Assets (Media Library)
-- ============================================

CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_name VARCHAR(255) NOT NULL,
  media_url VARCHAR(255) NOT NULL,
  meta_media_id VARCHAR(255),
  resource_type VARCHAR(50) DEFAULT 'image',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
