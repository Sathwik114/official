import "./globals.css";
import SiteFooter from "./SiteFooter";

export const metadata = {
  title: "HOD's Leave Management System",
  description: "GTI Leave Management System for HODs",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
