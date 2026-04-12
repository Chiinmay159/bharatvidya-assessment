import { useState } from 'react'
import { BatchSelect }    from '../components/student/BatchSelect'
import { Registration }   from '../components/student/Registration'
import { ConfirmIdentity } from '../components/student/ConfirmIdentity'
import { WaitingRoom }    from '../components/student/WaitingRoom'
import { Instructions }   from '../components/student/Instructions'
import { ExamScreen }     from '../components/student/ExamScreen'
import { ResultScreen }   from '../components/student/ResultScreen'

// Steps: 'select' → 'register' → 'confirm' → 'waiting' | 'instructions' → 'exam' → 'result'

export function StudentPage() {
  const [step,          setStep]          = useState('select')
  const [selectedBatch, setSelectedBatch] = useState(null)
  const [student,       setStudent]       = useState(null) // { rollNumber, studentName, email }
  const [result,        setResult]        = useState(null)

  function handleSelectBatch(batch) {
    setSelectedBatch(batch)
    setStep('register')
  }

  // Called by Registration with { rollNumber, studentName, email }
  function handleRegistered(studentData) {
    setStudent(studentData)
    setStep('confirm')
  }

  // Called by ConfirmIdentity "Confirm" button
  function handleConfirmed() {
    if (selectedBatch.status === 'active') {
      setStep('instructions')
    } else {
      setStep('waiting')
    }
  }

  // Called by WaitingRoom when batch becomes active
  function handleExamStarted() {
    setSelectedBatch(prev => ({ ...prev, status: 'active' }))
    setStep('instructions')
  }

  // Called by Instructions "I understand, begin exam" button
  function handleInstructionsAccepted() {
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

  if (step === 'confirm') {
    return (
      <ConfirmIdentity
        batch={selectedBatch}
        student={student}
        onConfirm={handleConfirmed}
        onBack={() => setStep('register')}
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

  if (step === 'instructions') {
    return (
      <Instructions
        batch={selectedBatch}
        rollNumber={student.rollNumber}
        onBegin={handleInstructionsAccepted}
      />
    )
  }

  if (step === 'exam') {
    return (
      <ExamScreen
        batch={selectedBatch}
        rollNumber={student.rollNumber}
        studentName={student.studentName}
        email={student.email}
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
