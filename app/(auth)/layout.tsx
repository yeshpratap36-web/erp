export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-start justify-center bg-muted/40 px-4 py-10 sm:items-center">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
