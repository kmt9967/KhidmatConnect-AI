export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6">
      <div className="mx-auto max-w-md w-full">
        <div className="text-center mb-8">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-xl">
            K
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Login to KhidmatConnect
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Access for registered citizens, operators, and responders.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <p className="text-center text-sm text-gray-400">
            Login form — coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
