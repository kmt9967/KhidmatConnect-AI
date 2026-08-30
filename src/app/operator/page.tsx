export default function OperatorPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
          <span className="text-3xl">🎯</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">
          Operator Dashboard
        </h1>
        <p className="mt-4 text-gray-600">
          Operator / coordinator dashboard for reviewing emergency cases,
          managing resources, and assigning responders.
        </p>
        <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-white p-8">
          <p className="text-sm text-gray-400">
            Operator dashboard — coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
