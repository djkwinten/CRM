import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Providers } from './components/Providers'
import { Dashboard } from './pages/Dashboard'
import { BookingDetail } from './pages/BookingDetail'
import { GigSheet } from './pages/GigSheet'
import { CustomerForm } from './pages/CustomerForm'
import { Reminders } from './pages/Reminders'
import { Agenda } from './pages/Agenda'
import { BlankForm } from './pages/BlankForm'
import { Venues } from './pages/Venues'
import { Templates } from './pages/Templates'
import { EventPortal } from './pages/EventPortal'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/event/:slug" element={<EventPortal />} />
      <Route path="/vragenlijst/:slug" element={<CustomerForm />} />
      <Route path="/formulier/:id" element={<CustomerForm />} />
      <Route path="/" element={<Dashboard />} />
      <Route path="/agenda" element={<Agenda />} />
      <Route path="/boeking/:id" element={<BookingDetail />} />
      <Route path="/gigsheet/:id" element={<GigSheet />} />
      <Route path="/herinneringen" element={<Reminders />} />
      <Route path="/leeg-formulier" element={<BlankForm />} />
      <Route path="/zalen" element={<Venues />} />
      <Route path="/templates" element={<Templates />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <Providers>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </Providers>
  )
}

export default App
