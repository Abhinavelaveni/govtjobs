# Government Jobs Scraper & WhatsApp Alert Platform

Build a complete, modern web application that automatically collects **genuine government job notifications for Indian citizens** from trusted/official recruitment websites and sends matching job alerts to users through WhatsApp.

The application should have a professional SaaS-style interface using **TailGrids** and Tailwind CSS.

---

## 1. Main Objective

The platform should work as follows:

```text
Government Recruitment Websites
          ↓
     Job Scraper
          ↓
   Job Validation
          ↓
     Database
          ↓
   User Preferences
          ↓
    Job Matching
          ↓
 WhatsApp Notification
          ↓
       User
```

The system should continuously discover newly published government job notifications and notify users whose preferences match the job.

---

# 2. Government Job Sources

Create a scraper system capable of collecting recruitment notifications from trusted and official sources.

Initial source categories:

* UPSC
* SSC
* IBPS
* SBI Careers
* Railway Recruitment Boards
* Indian Railways
* State Public Service Commissions
* State Government Recruitment Boards
* Police Recruitment Boards
* Defence recruitment portals
* Teaching recruitment boards
* Employment News
* Other verified government recruitment websites

The application should allow administrators to add additional sources later.

### Important

Prefer official government recruitment sources.

Every job should retain:

* Original source URL
* Official notification URL
* Official application URL
* Organization name
* Publication date

Do not fabricate missing job information.

---

# 3. Job Scraper

Build a robust scraping engine.

The scraper should automatically:

1. Visit configured recruitment websites.
2. Detect newly published notifications.
3. Extract job information.
4. Normalize the information.
5. Validate the extracted data.
6. Check for duplicates.
7. Store new jobs in the database.
8. Trigger the job-matching system.
9. Generate WhatsApp alerts for matching users.

Support:

* HTML pages
* Pagination
* Multiple recruitment pages
* Official RSS and JSON feeds where available
* Server-rendered HTML listings parsed with Node.js, Axios, and Cheerio
* Retry handling
* Timeout handling
* Duplicate detection
* Error logging
* Scraper status monitoring

Use appropriate tools such as:

```text
Node.js
Axios
Cheerio
```

Use site-specific scraper adapters where necessary because every recruitment website may have a different HTML structure.

Respect website terms, robots.txt, reasonable request rates, and applicable laws.

---

# 4. Job Information

For every job, extract and store:

```text
Job Title
Organization
Department
Recruitment Number
Notification Number
Job Category
Vacancies
Qualification
Age Limit
Salary / Pay Scale
Experience
Job Location
Application Start Date
Application Last Date
Application Fee
Selection Process
Exam Date
Publication Date
Official Notification URL
Official Application URL
Source Website
```

---

# 5. Job Categories

Create categories such as:

```text
Central Government
State Government
Banking
Railways
Defence
Police
Teaching
Engineering
Medical
IT
Administrative
PSU
Research
Other
```

Administrators should be able to create and modify categories.

---

# 6. User Registration

Users should be able to create an account and configure their job-alert preferences.

User information:

```text
Name
WhatsApp Mobile Number
State
District
Education Qualification
Experience
Age
Preferred Job Categories
Preferred Departments
Preferred Locations
Keywords
Minimum Salary
Government Level
WhatsApp Alert Status
```

Government level:

```text
Central Government
State Government
Both
```

---

# 7. User Job Preferences

Users should be able to configure exactly which jobs they want to receive.

Example:

```text
Education:
B.Tech

Branches:
CSE / IT

Preferred Categories:
IT
Engineering
PSU

Preferred Locations:
Telangana
Andhra Pradesh
Remote

Government Level:
Central + State

Keywords:
Software Engineer
Developer
Technical Assistant
Programmer
```

The matching system should compare newly scraped jobs against these preferences.

---

# 8. Job Matching Engine

When a new job is added:

```text
New Job
   ↓
Read User Preferences
   ↓
Match Qualification
   ↓
Match Category
   ↓
Match Location
   ↓
Match Keywords
   ↓
Match Government Level
   ↓
Eligible Users
   ↓
WhatsApp Notification
```

Only users whose configured preferences match the job should receive the alert.

Prevent the same user from receiving the same job notification multiple times.

---

# 9. WhatsApp API Integration

Call the WhatsApp API through an authenticated server endpoint so browser CORS restrictions cannot block delivery. The API key remains in the administrator's browser session and is sent to the application server only for each send; do not persist it on the server or use environment variables for WhatsApp configuration.

Do not use environment variables for the WhatsApp API configuration.

Use the following API structure:

```text
https://waapi.hybridnet.in/api/v1/sessions/050fe2b6-483f-4b89-b3f1-fde2602a22d0/messages/send-text
```

Query parameters:

```text
apikey
receiver
message
template
```

Example:

```text
https://waapi.hybridnet.in/api/v1/sessions/050fe2b6-483f-4b89-b3f1-fde2602a22d0/messages/send-text?apikey=YOUR_API_KEY&receiver=91MOBILENUMBER&message=YOUR_MESSAGE&template=YOUR_TEMPLATE_ID
```

The frontend should dynamically replace:

```text
MOBILENUMBER
MESSAGE
TEMPLATE_ID
```

Example:

```text
receiver=919876543210
```

Message should be URL encoded before being added to the request.

---

# 10. WhatsApp Notification Flow

Example:

```text
New Government Job
        ↓
Find Matching Users
        ↓
Generate Notification Message
        ↓
Get User WhatsApp Number
        ↓
Build WhatsApp API URL
        ↓
Call WhatsApp API
        ↓
Record Response
        ↓
Update Notification Status
```

Notification statuses:

```text
Pending
Sending
Sent
Failed
Retrying
```

Store:

```text
User
Job
WhatsApp Number
Message
Template ID
Timestamp
API Response
Status
Error
```

---

# 11. WhatsApp Message Template

Generate messages similar to:

```text
🔔 GOVERNMENT JOB ALERT

📌 Job: {JOB_TITLE}

🏢 Organization:
{ORGANIZATION}

💼 Vacancies:
{VACANCIES}

🎓 Qualification:
{QUALIFICATION}

📍 Location:
{LOCATION}

💰 Salary:
{SALARY}

📅 Last Date:
{LAST_DATE}

📝 Apply Online:
{APPLICATION_URL}

📄 Official Notification:
{NOTIFICATION_URL}

Source:
{SOURCE_NAME}
```

The system should dynamically generate the message from the stored job information.

Allow administrators to create and manage WhatsApp message templates.

---

# 12. WhatsApp API Configuration

Create a frontend configuration section where the administrator can configure:

```text
WhatsApp API URL
Session ID
API Key
Default Template ID
```

Example configuration:

```text
API URL:
https://waapi.hybridnet.in/api/v1/sessions/050fe2b6-483f-4b89-b3f1-fde2602a22d0/messages/send-text

API Key:
owb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Session ID:
050fe2b6-483f-4b89-b3f1-fde2602a22d0

Template ID:
government_job_alert
```

The application should allow the administrator to test the WhatsApp API by sending a test message.
The server accepts a base sessions URL or a full send-text endpoint and restricts requests to `https://waapi.hybridnet.in`.

---

# 13. Admin Dashboard

Create a complete administration dashboard.

### Dashboard Overview

Display:

```text
Total Jobs
Jobs Added Today
Active Users
WhatsApp Subscribers
Messages Sent
Messages Failed
Pending Notifications
Active Scrapers
```

Use TailGrids cards and dashboard components.

---

# 14. Job Management

Admin should be able to:

```text
View Jobs
Search Jobs
Filter Jobs
Create Job
Edit Job
Delete Job
Verify Job
Feature Job
View Source
View Application Link
View Notification History
```

Filters:

```text
Category
State
Organization
Qualification
Published Date
Application Deadline
Government Level
```

---

# 15. Scraper Management

Create a scraper management page.

Display:

```text
Source Name
Source URL
Scraper Status
Last Run
Next Run
Jobs Found
New Jobs
Duplicate Jobs
Errors
```

Admin actions:

```text
Add Source
Edit Source
Enable Source
Disable Source
Run Scraper
View Logs
```

---

# 16. User Management

Admin should be able to:

```text
View Users
Search Users
View User Profile
View Preferences
Enable WhatsApp Alerts
Disable WhatsApp Alerts
View Notification History
```

Display WhatsApp subscription status.

---

# 17. Notification Management

Create a notification management page.

Show:

```text
Notification ID
User
Job
WhatsApp Number
Message
Template
Status
Sent At
API Response
```

Allow:

```text
Retry Failed
View Details
Filter Status
Filter Date
Search User
Search Job
```

---

# 18. User Dashboard

Users should have a clean dashboard containing:

```text
Latest Government Jobs
Recommended Jobs
Saved Jobs
Job Categories
Upcoming Deadlines
WhatsApp Alert Settings
Notification History
```

Users can:

```text
Search Jobs
Filter Jobs
View Job Details
Save Jobs
Share Jobs
Configure Preferences
Enable/Disable WhatsApp Alerts
```

---

# 19. Job Details Page

Create a detailed job page containing:

```text
Job Title
Organization
Department
Vacancies
Qualification
Age Limit
Salary
Location
Application Dates
Selection Process
Application Fee
Official Notification
Apply Online
Source
```

Use clear sections and TailGrids cards.

Provide prominent buttons:

```text
Apply Now
View Official Notification
Save Job
```

---

# 20. Search & Filtering

Implement fast job search.

Search by:

```text
Job Title
Organization
Department
Keyword
```

Filters:

```text
State
Category
Qualification
Government Level
Salary
Location
Application Deadline
Published Date
```

---

# 21. Database

The API stores data in MongoDB using the official Node.js driver. It creates the required collections and indexes when it connects; `npm run migrate` initializes the standard categories, settings, and numeric ID counters.

Suggested schema:

```text
users
user_preferences
jobs
job_categories
job_sources
scraper_runs
notifications
notification_logs
saved_jobs
whatsapp_templates
whatsapp_config
settings
counters
```

Unique indexes enforce email, job fingerprint, notification-per-user/job, saved-job-per-user/job, category/source names, and settings keys.

Example:

```text
organization + notification_number + official_url
```

---

# 22. Frontend Technology

Use:

```text
React
Vite
Tailwind CSS
TailGrids
React Router
Axios
```

UI should be completely based on **TailGrids** components and Tailwind CSS.

Reference:

https://tailgrids.com/

---

# 23. UI Design

Create a modern government-jobs SaaS platform.

Design characteristics:

```text
Clean
Professional
Modern
Responsive
Fast
Accessible
Information-focused
```

Use:

* Sidebar navigation
* Top navbar
* Dashboard cards
* Tables
* Tabs
* Filters
* Search bars
* Modals
* Dropdowns
* Toast notifications
* Pagination
* Badges
* Charts
* Empty states
* Loading states
* Error states

Default theme:

```text
Light / White
```

Also provide:

```text
Dark Mode
```

---

# 24. Suggested Navigation

### User

```text
Dashboard
Government Jobs
Recommended Jobs
Saved Jobs
Categories
Notifications
WhatsApp Alerts
My Profile
Preferences
```

### Admin

```text
Dashboard
Jobs
Categories
Job Sources
Scrapers
Users
Notifications
WhatsApp
Templates
Logs
Settings
```

---

# 25. REST API

Create APIs such as:

```text
POST /api/auth/register
POST /api/auth/login

GET /api/jobs
GET /api/jobs/:id

GET /api/categories
GET /api/sources

GET /api/users/preferences
PUT /api/users/preferences

GET /api/notifications
PUT /api/notifications/preferences

GET /api/admin/dashboard
GET /api/admin/jobs
GET /api/admin/users
GET /api/admin/sources
GET /api/admin/scrapers
GET /api/admin/notifications

POST /api/admin/sources/:id/scrape
POST /api/admin/notifications/:id/retry
```

---

# 26. Background Scraping

The scraper should run automatically according to the configured schedule.

Example:

```text
Every 30 minutes
       ↓
Check recruitment websites
       ↓
Extract notifications
       ↓
Validate
       ↓
Deduplicate
       ↓
Save new jobs
       ↓
Find matching users
       ↓
Send WhatsApp alerts
```

Allow administrators to change the scraping interval.

---

# 27. Error Handling

Handle:

```text
Website unavailable
Timeout
Invalid HTML
Missing fields
Duplicate job
WhatsApp API failure
Invalid mobile number
Invalid template
Rate limit
Network failure
Database failure
```

The application should log errors without crashing the scraper or notification worker.

---

# 28. Security & Validation

Although WhatsApp API integration is intentionally performed from the frontend, implement:

* Admin authentication
* Role-based access control
* Form validation
* API response validation
* Input sanitization
* Mobile-number validation
* Notification rate limiting where possible
* Secure authentication
* CSRF/XSS protections where applicable

Do not expose unnecessary administrative functionality to normal users.

---

# 29. Notification Consent

Users must explicitly enable WhatsApp job alerts.

Provide:

```text
☑ Enable WhatsApp Job Alerts
```

Allow users to disable alerts at any time.

Support an opt-out mechanism such as:

```text
STOP
```

and ensure opted-out users are not sent future alerts.

---

# 30. Production Requirements

The final application should be production-ready and include:

```text
Frontend
Backend
Database
Scraper Engine
Job Matching Engine
WhatsApp Integration
Admin Dashboard
User Dashboard
Authentication
Notification System
Logging
Error Handling
Responsive UI
```

Provide:

```text
README.md
Installation Instructions
Database Setup
Scraper Configuration
WhatsApp API Configuration
Development Instructions
Production Build Instructions
Deployment Instructions
```

---

# 31. Overall User Experience

The final product should feel like a polished **Indian Government Jobs Alert Platform**, not a basic scraper.

The primary user journey should be:

```text
Register
   ↓
Enter WhatsApp Number
   ↓
Select Qualification
   ↓
Select Job Preferences
   ↓
Enable WhatsApp Alerts
   ↓
Browse Government Jobs
   ↓
System Finds New Jobs
   ↓
Matching Job Detected
   ↓
WhatsApp Alert Sent
   ↓
User Opens Official Application
```

The application should prioritize **accurate, verifiable recruitment information**, clearly identify the original source, and make the official application link easy to access.

---

## Local Development with MongoDB

1. Start a local MongoDB server or create a MongoDB Atlas database. The default local URI is `mongodb://127.0.0.1:27017`.
2. From PowerShell at the project root, create your local configuration and set a private JWT signing secret:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

3. Install dependencies and initialize the MongoDB collections/indexes and source presets:

   ```powershell
   npm install
   npm run migrate
   npm run seed
   ```

   Add `MONGODB_URI` and `MONGODB_DATABASE` to `.env` if you are not using the local defaults. The seed command installs source starting points. SBI Careers is enabled using its verified HTML adapter; the other sources remain disabled for review. UPSC, SSC, RRB, IBPS, Employment News, and NTPC are Tier 1; FreeJobAlert and Sahi Sarkari Jobs are Tier 2 aggregators, recorded in each source's config. The aggregator adapters keep the article URL as the source and accept notification/application links only on issuer-like hosts. NCS government search currently uses an encrypted POST request and has no server-rendered listing, so it is not seeded as an automated scraper. No job information is invented.

4. From the project root, run `npm install` once, then `npm run dev` to start both the API on port `4000` and the frontend on port `5173`. Vite proxies `/api` requests to the API. Use `npm run dev:api` or `npm run dev:web` to start only one service.
5. Register through the app. To grant administrator access to a trusted account, run `mongosh`, select the configured database, and execute `db.users.updateOne({ email: 'your-address@example.com' }, { $set: { role: 'admin' } })`; then sign out and sign back in.

The jobs board and official-source links are public. Saving jobs, preferences, alert history, and administration require an account. WhatsApp API settings are kept in the administrator's browser; the API key is held in session storage and requests are sent directly to the configured WhatsApp provider. Provider browser CORS support is required for browser-based sending.

Run `npm test` and `npm run build` from the project root to verify backend behavior and build the production frontend.
