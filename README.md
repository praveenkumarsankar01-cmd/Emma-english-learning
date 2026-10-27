# Learn English with Emma

Webinar funnel for an online English teacher: a free live class that leads to paid classes and an 8-week course.

**Flow:** webinar registration → watch session → offer page → checkout → booking confirmed

Static HTML, CSS and JavaScript. No build step, so the folder can be deployed as it is (Vercel, Netlify or GitHub Pages).

## Pages

```
index.html        landing page: hero, student quote, about Emma, 6-minute preview lesson,
                  what you'll learn, free class sign-up, upcoming $35 classes,
                  how it works, programs, fit check, reviews, FAQ
watch.html        webinar room after sign-up: class time, warm-up video, class agenda
                  and the attendee offer with a 48-hour timer
offer.html        the 8-week course: what's included, week by week, prices, guarantee
checkout.html     plan, class or start date, student details; hands over to payment
confirmed.html    booking confirmed: masked contact details, add to calendar, workbook
legal.html        privacy, terms and refunds
emails/           follow-up email templates (see below)
guide/            source of the Speaking Guide PDF
assets/           styles, script, fonts (DM Sans and Playfair Display, SIL OFL), images, PDF
```

## Class times

Class times are set in UTC at the top of `assets/site.js` and shown in each visitor's own time zone.

- Free live class: Wednesday and Saturday, 13:30 UTC (7:00 PM in India)
- Paid live classes ($35): Monday and Thursday, 13:30 UTC, topics listed in `TOPICS`
- The 8-week course: a new group starts every week, on Monday 13:30 UTC

Bookings close 2 hours before a class starts.

## Payments

Checkout collects the plan and the student's details, then sends them to your payment page. Card details are never collected on this site.

Add one payment link per plan in `paymentLinks` at the top of `assets/site.js` (Stripe Payment Links, Razorpay or PayPal):

| Key | Price |
| --- | --- |
| `single` | $35 single class |
| `pack` | $119 4-class pack |
| `course` | $249 course, attendee price |
| `courseFull` | $299 course, full price |

A booking reference and the student's email are added to the link. With no link set, checkout goes straight to the confirmation page (demo mode).

## Attendee price

The course is $299. People who sign up for a free class get $249 until 48 hours after their class ends; the pages switch back to $299 on their own when the time runs out. In emails 3 and 4, point `{{course_link}}` at `offer.html?attendee=1` on your domain so the price also works on another phone or browser.

To receive sign-ups and bookings, paste a form endpoint (Formspree, a Make or Zapier webhook, or your email tool's form URL) into `endpoint`.

## Email follow-up

Load these into your email tool. Merge tags are written as `{{first_name}}`; rename them to match your tool.

| When | Email |
| --- | --- |
| Straight after sign-up | `1-registered.html` |
| 1 hour before the free class | `2-reminder.html` |
| After the free class | `3-replay-offer.html` |
| When the attendee price ends | `4-last-call.html` |
| After payment | `5-booking-confirmed.html` |

## Notes

- **Contact details are fictional.** The email (`emma@learnenglishwithemma.co.uk`), phone (`+44 20 7946 0817`) and street address look real but reach no one: the number is from Ofcom's range reserved for drama, so it never connects to a real line, and the email domain is unregistered. Replace them with the real ones before launch.
- **Student data is masked.** On the confirmation page the student's email keeps only its first 2 letters and the domain (`pr•••••@gmail.com`) and the phone only its last 2 digits.
- **Videos.** The preview lesson and the warm-up video are from BBC Learning English on YouTube and are credited under each player. Swap them for Emma's own videos when they're ready (see the comments in `index.html` and `watch.html`).
- **Hero video** is a 7-second loop cut from Pexels video 7682758 (free licence), in `assets/video` as MP4 and WebM, with a smaller copy for phones.
- **Photos** come from Pexels (free licence) and load from Pexels for now. Download them into `assets/img` before launch.
- **Speaking Guide PDF.** `assets/emma-speaking-guide.pdf` is printed from `guide/speaking-guide.html` (A4, no margins, background graphics on).
- **Link previews.** Before launch, set `og:image` in `index.html` to the full https URL on the live domain and add `og:url`.
- **Prices, class times, seat counts and reviews are sample content.** Replace them with real details and real student reviews (with permission) before launch.

## Run locally

```
npx serve .
```
