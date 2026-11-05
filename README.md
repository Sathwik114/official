This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Browser support

The application targets Chrome and Edge 111+, Firefox 111+, Safari and iOS
Safari 16.4+, Android Chrome and Firefox 111+, Samsung Internet 21+, and Opera
Mobile 97+.

Internet Explorer is not supported by Next.js 16 / React 19. Supporting IE
would require replacing the current framework stack; adding polyfills alone is
not sufficient.

## Direct email approvals

Approver notification emails link to `/approve-leaves-direct` and show only
requests currently assigned to the link's approver. Tokens are revoked after
40 days in the database, while the email states that the link expires after
35 days.
Tokens are random bearer credentials, and anyone who obtains a
link can act as that approver until it expires or is revoked. Token hashes and
leave details (transaction ID, employee code/name, dates, and leave type) are
stored in `OfficialLeave.dbo.DirectApprovalTokens`. `RevokedAt` stores the
expiry timestamp for active links; revoke all links for an approver with
`revokeDirectApprovalTokensForApprover` from `src/lib/leaveDb.js` or by setting
`RevokedAt = GETDATE()` for that approver's active rows. Existing rows without a
`RevokedAt` value and currently active links are migrated to expire 40 days
after `CreatedAt`. Set `APP_URL` (or
`NEXT_PUBLIC_APP_URL`) to the application's reachable HTTPS base URL before
enabling email approvals. Approvers can also sign in and use the normal
dashboard.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
