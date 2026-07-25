# Implementation Plan - Redesigned Zomato-style Business Discovery

Redesign the customer business discovery experience (`BookingDirectory.tsx`) into a modern Zomato/Swiggy-style flow: Discover Businesses → Open Business → Select Branch → Select Doctor → Book Appointment.

## User Review Required

> [!IMPORTANT]
> - Geolocation: The page will automatically prompt the user for Geolocation access to sort clinics by nearest distance. If denied, it defaults to Bangalore center and displays "— km" or default distance.
> - Pricing and Rating metadata: Added mock rating, experience, languages, and starting consultation fee metadata to make the cards look rich and premium, similar to a real-world Zomato/Swiggy directory.

## Proposed Changes

### Web Application

- [x] Create reusable components
  - [x] `BusinessCard.tsx`
  - [x] `BranchCard.tsx`
  - [x] `DoctorCard.tsx`

#### [NEW] [BusinessCard.tsx](file:///Users/anshit.arya/Documents/Personal-repos/Hospital Queue/apps/web/components/BusinessCard.tsx)
Create a reusable, compact card component representing a clinic/business. It displays:
- Business type icon & category badge
- Business name
- Clean image placeholder or stylized brand circle
- Number of branches
- Nearest branch distance (e.g., "1.2 km away")
- Minimum consultation fee / Starting price (e.g. "Starts at ₹300")
- Waiting time badge

#### [NEW] [BranchCard.tsx](file:///Users/anshit.arya/Documents/Personal-repos/Hospital Queue/apps/web/components/BranchCard.tsx)
Create a reusable branch selector card. It displays:
- Branch name & Address
- Live waiting status / waiting time
- Number of doctors
- Distance from user
- "Select Branch" button

#### [NEW] [DoctorCard.tsx](file:///Users/anshit.arya/Documents/Personal-repos/Hospital Queue/apps/web/components/DoctorCard.tsx)
Create a reusable doctor/professional profile card. It displays:
- Profile photo placeholder with availability badge
- Name & Specialty
- Metadata (Experience: e.g. "8 Years Exp", Languages: "English, Hindi")
- Consultation fee
- Live queue length & estimated wait time
- "Book Appointment" button

#### [MODIFY] [BookingDirectory.tsx](file:///Users/anshit.arya/Documents/Personal-repos/Hospital Queue/apps/web/components/BookingDirectory.tsx)
Rewrite `BookingDirectory` to orchestrate the new navigation stack:
1. **Discovery Feed**: Search box + Grid/List of `BusinessCard`s sorted by distance.
2. **Business Details View**: Shows business metadata, reviews, and a list of `BranchCard`s.
3. **Branch Details View**: Shows the selected branch details and a grid of `DoctorCard`s.
4. **Booking Wizard**: Inline booking confirmation form for the chosen doctor (shifts, slots, reason, no-show policy).

Add geolocation calculation:
- Fetch user coordinates via browser Geolocation API on mount.
- Calculate distances between the user and branch coordinates using the Haversine formula.

## Verification Plan

### Automated Verification
- Run Next.js production build check: `npm run build` in `apps/web`.
- Run workspace tests: `npm test` in `apps/web` to verify zero test regressions.

### Manual Verification
- Test responsive layout on both Desktop (Grid) and Mobile (List).
- Test search filtering by business name, branch name, or doctor name.
- Verify geolocation prompts and nearest-first distance sorting.
