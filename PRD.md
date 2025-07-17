# Product Requirements Document for Bhajan Sangam

## App Overview
- Name: Bhajan Sangam
- Tagline: Your comprehensive digital library for devotional bhajans with lyrics, chords, and spiritual guidance
- Category: web_application
- Visual Style: Zen Minimalist (e.g. Muji)

## Workflow

Users browse the bhajan library through search and filters, tap to view detailed lyrics with chords for their chosen instrument, listen to audio snippets, access spiritual analyses and video tutorials, save favorites, and contribute new bhajans for community review.

## Application Structure


### Route: /

Main bhajan library with search bar, filter tags (Kirtan, author filters), scrollable list showing title/author/play button. Bottom navigation to Favorites and Settings. Tapping items opens detail view, play buttons trigger audio snippets.


### Route: /favorites

User's saved bhajans in same list format as main screen with search/filter capabilities. Requires authentication to persist across sessions.


### Route: /settings

User profile with Google/Facebook/email authentication, language preferences, default instrument selection, About/Projects/Contact links, Donate button, and Add Bhajan contribution feature.


## Potentially Relevant Utility Functions

### upload

Potential usage: For uploading audio snippets, full analyses, and user-contributed content

Look at the documentation for this utility function and determine whether or not it is relevant to the app's requirements.


----------------------------------

### getAuth

Potential usage: For user authentication and managing favorites/preferences

Look at the documentation for this utility function and determine whether or not it is relevant to the app's requirements.


----------------------------------

### requestMultimodalModel

Potential usage: For generating chord diagrams and processing user-submitted content

Look at the documentation for this utility function and determine whether or not it is relevant to the app's requirements.