Build a modern, scalable marketplace platform called “Uppdragsutbildning.nu”.

The platform connects companies with universities and training providers offering commissioned education (executive education / corporate training).

---

### 🎯 CORE PURPOSE
Create a marketplace where companies can:
- Discover training programs
- Compare providers
- Submit requests for proposals (RFPs)

And where universities / training providers can:
- List their courses
- Receive qualified leads
- Gain visibility

---

### 👥 USER TYPES

1. Companies (buyers)
2. Training providers (universities, private education companies)
3. Admin (platform owner)

---

### 🧩 CORE FEATURES (MVP)

#### 1. Homepage
- Clear value proposition: “Find the right training for your organization”
- Search bar (keywords, categories)
- Featured categories
- Featured trainings

---

#### 2. Training Catalog (Marketplace)
- List of all training programs
- Filters:
  - Category (Leadership, AI, HR, Healthcare, Public Sector, Industry, etc.)
  - Format (online, onsite, hybrid)
  - Provider
- Sorting (popular, newest)

---

#### 3. Training Detail Page
Each training should include:
- Title
- Description
- Provider (university/company)
- Category
- Format
- Target audience
- Duration
- CTA: “Request quote”

---

#### 4. Request for Proposal (RFP) / Lead Form
Form where companies submit:
- Company name
- Contact details
- Training need description
- Budget (optional)
- Timeline

After submission:
- Confirmation page
- Lead stored in database
- Admin + provider notified

---

#### 5. Provider Dashboard (simple MVP)
Providers can:
- Create/edit training listings
- View incoming leads
- Basic analytics (number of views/leads)

---

#### 6. Admin Dashboard
Admin can:
- Approve/edit listings
- Manage providers
- View all leads
- Assign leads to providers

---

### 💰 BUSINESS MODEL LOGIC

- Platform owns the customer relationship
- All requests go through the platform
- Leads are captured centrally
- Future features:
  - Premium listings (boost visibility)
  - Commission tracking (5–20%)
  - Billing module

---

### 🧠 UX PRINCIPLES

- Clean, modern, trustworthy design (similar to Airbnb / marketplace UX)
- Easy search experience
- Minimal friction to submit request
- Strong CTA buttons

---

### 📊 DATA MODEL (IMPORTANT)

Entities:
- Users (company, provider, admin)
- Trainings
- Providers
- Leads (RFPs)
- Categories

Relationships:
- Provider → many Trainings
- Training → belongs to Category
- Lead → linked to Training or general request

---

### ⚙️ TECH / STRUCTURE

- Responsive web app
- SEO-friendly pages (important for organic traffic)
- Scalable backend
- Clean API structure for future integrations

---

### 🚀 FUTURE FEATURES (design for extensibility)

- AI-powered training recommendations
- Automated matching between company needs and providers
- External training catalogs for enterprises (premium feature)
- Payment & invoicing system
- Reviews & ratings

---

### 🎨 DESIGN STYLE

- Scandinavian minimalism
- Professional and modern
- Colors: neutral + trust (blue/green tones)
- Clear typography
- Card-based UI for listings

---

### 🏁 GOAL

Deliver a functional MVP where:
- Companies can search and submit requests
- Providers can list trainings
- Admin can manage the marketplace