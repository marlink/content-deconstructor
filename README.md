<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Design System

A comprehensive design system for building consistent and maintainable user interfaces.

## Overview

This contains everything you need to run the design system locally.

## Environment Setup

1. Copy `.env.template` to `.env.local`:
   ```bash
   cp .env.template .env.local
   ```

2. Edit `.env.local` and add your Gemini API key:
   ```bash
   # Replace YOUR_API_KEY with your actual Gemini API key
   GEMINI_API_KEY=YOUR_API_KEY
   ```

3. Never commit `.env.local` to version control - it's already in .gitignore

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
