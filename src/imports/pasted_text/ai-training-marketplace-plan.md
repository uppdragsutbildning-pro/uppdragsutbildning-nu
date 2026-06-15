84"}
Build a modern AI-powered marketplace platform called “Uppdragsutbildning.nu”.

This platform connects companies with universities and training providers offering corporate training (commissioned education).

The platform should not only list trainings, but actively help companies understand their needs and find the best solution using AI.

---

### 🎯 CORE IDEA

This is an “AI-powered training advisor + marketplace”.

The system should:
- Understand company needs using AI
- Recommend the best training solutions
- Generate structured requests and proposals
- Help providers convert leads into deals

---

### 👥 USER TYPES

1. Companies (buyers)
2. Training providers (universities, private education companies)
3. Admin

---

### 🧠 AI FEATURES (CRITICAL – BUILD INTO CORE UX)

#### 1. AI Needs Analysis (Top priority)

Instead of a simple form, create an AI input flow:

User input:
- Free text: “Describe your challenge”

AI should output:
- Recommended categories
- Suggested training type (workshop, program, etc.)
- Target audience (managers, employees, etc.)
- Estimated scope and complexity

Show this as a structured summary before submitting request.

---

#### 2. AI Training Matching

Based on the needs analysis, automatically show:

- Top 3 recommended trainings
- Best matching providers

Use:
- Tags
- Categories
- Semantic matching (AI embeddings if possible)

---

#### 3. AI Copilot (Chat Assistant)

Add a chat interface where users can ask:

Examples:
- “We need leadership training for 20 managers”
- “We want to improve AI skills in our company”

The AI should:
- Ask clarifying questions
- Recommend trainings
- Guide to submitting a request

---

#### 4. AI-generated Request (RFP Builder)

When user submits a request:

AI should generate:
- Structured training brief
- Suggested learning objectives
- Recommended format
- Budget estimation (optional)

Store this as part of the lead.

---

#### 5. AI for Providers (Content Optimization)

When providers create a training:

Add button: “Improve with AI”

AI improves:
- Title
- Description
- Target audience clarity
- Value proposition

---

#### 6. AI Lead Scoring

Each incoming lead should be scored:
- High / Medium / Low intent

Based on:
- completeness
- urgency
- budget signals

---

### 🧩 CORE FEATURES

- Homepage with AI search + categories
- Training catalog with filters
- Training detail pages
- AI-assisted request flow
- Provider dashboard
- Admin dashboard

---

### 📊 DATA MODEL

Entities:
- Users
- Providers
- Trainings
- Leads
- Categories

Leads must include:
- Original input
- AI-generated summary
- AI score

---

### ⚙️ TECH REQUIREMENTS

- Responsive web app
- Scalable backend
- API-first structure
- AI integration ready (LLM + embeddings)

---

### 🎨 UX PRINCIPLES

- Clean, modern (Airbnb-style)
- AI-first experience
- Minimal friction
- Strong call-to-actions

---

### 🚀 FUTURE READY (design for extension)

- Outcome tracking (training results)
- Benchmarking data
- AI pricing recommendations
- Enterprise catalogs

---

### 🏁 GOAL

Deliver an MVP where:
- Companies can describe needs in natural language
- AI interprets and recommends solutions
- Providers receive structured, high-quality leads
- Platform acts as an intelligent advisor, not just a dire