import { useState, useEffect } from 'react'
import { BatchSelect } from '../components/student/BatchSelect'
import { Registration } from '../components/student/Registration'
import { WaitingRoom } from '../components/student/WaitingRoom'
import { ExamScreen } from '../components/student/ExamScreen'
import { ResultScreen } from '../components/student/ResultScreen'

// Steps: 'select' → 'register' → 'waiting' | 'exam' → 'result'

export function StudentPage() {
  const [step, setStep] = useState('select')
  const [selectedBatch, setSelectedBatch] = useState(null)
  const [student, setStudent] = useState(null) // { rollNumber, studentName }
  const [result, setResult] = useState(null)

  function handleSelectBatch(batch) {
    setSelectedBatch(batch)
    setStep('register')
  }

  function handleRegistered({ rollNumber, studentName }) {
    setStudent({ rollNumber, studentName })
    // Decide next step based on batch status
    if (selectedBatch.status === 'active') {
      setStep('exam')
    } else {
      setStep('waiting')
    }
  }

  function handleExamStarted() {
    // Re-fetch fresh batch data to get updated status
    setSelectedBatch(prev => ({ ...prev, status: 'active' }))
    setStep('exam')
  }

  function handleComplete(examResult) {
    setResult(examResult)
    setStep('result')
  }

  if (step === 'select') {
    return <BatchSelect onSelectBatch={handleSelectBatch} />
  }

  if (step === 'register') {
    return (
      <Registration
        batch={selectedBatch}
        onRegistered={handleRegistered}
        onBack={() => setStep('select')}
      />
    )
  }

  if (step === 'waiting') {
    return (
      <WaitingRoom
        batch={selectedBatch}
        rollNumber={student.rollNumber}
        studentName={student.studentName}
        onExamStarted={handleExamStarted}
      />
    )
  }

  if (step === 'exam') {
    return (
      <ExamScreen
        batch={selectedBatch}
        rollNumber={student.rollNumber}
        studentName={student.studentName}
        onComplete={handleComplete}
      />
    )
  }

  if (step === 'result') {
    return (
      <ResultScreen
        result={result}
        batch={selectedBatch}
        rollNumber={student?.rollNumber}
        studentName={student?.studentName}
      />
    )
  }

  return null
}
