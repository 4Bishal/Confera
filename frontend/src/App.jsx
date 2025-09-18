import { AuthProvider } from "./contexts/AuthContext"
import Authentication from "./pages/authentication"
import LandingPage from "./pages/LandingPage"
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { VideoMeet } from "./pages/VideoMeet"
function App() {
  return (
    <>
      <Router>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<Authentication />} />
            <Route path="/:url" element={<VideoMeet />} />
          </Routes>
        </AuthProvider>
      </Router>
    </>
  )
}
export default App
