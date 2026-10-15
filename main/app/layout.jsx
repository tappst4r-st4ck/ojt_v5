import "./globals.css";

export const metadata = {
  title: "TESDA Regional Operations Hub",
  description: "TESDA scheduling and institutional operations dashboard prototype.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
