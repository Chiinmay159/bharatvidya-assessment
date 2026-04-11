export function ResultScreen({ result, batch, rollNumber, studentName }) {
  const { score, total, percentage, alreadySubmitted } = result || {}

  if (alreadySubmitted) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-gray-200 rounded-xl p-10">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Already Submitted</h1>
          <p className="text-gray-500 text-sm">
            This roll number has already submitted this exam. Please contact your invigilator if you believe this is an error.
          </p>
        </div>
      </div>
    )
  }

  const passed = percentage >= 60

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="bg-white border border-gray-200 rounded-xl p-10">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
          passed ? 'bg-green-100' : 'bg-red-50'
        }`}>
          {passed ? (
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Exam Submitted</h1>
        <p className="text-gray-500 text-sm mb-8">{batch?.name}</p>

        <div className="bg-gray-50 rounded-xl p-6 mb-6">
          <div className={`text-6xl font-bold mb-1 ${passed ? 'text-green-600' : 'text-red-500'}`}>
            {percentage}%
          </div>
          <div className="text-gray-500 text-sm">
            {score} out of {total} correct
          </div>
        </div>

        <div className="text-sm text-gray-500 space-y-1 mb-8">
          <p>Roll No: <strong className="text-gray-900">{rollNumber}</strong></p>
          <p>Name: <strong className="text-gray-900">{studentName}</strong></p>
        </div>

        <p className="text-gray-400 text-sm">
          Thank you for taking the exam. You may close this window.
        </p>
      </div>
    </div>
  )
}
