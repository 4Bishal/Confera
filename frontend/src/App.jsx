import { AuthProvider } from "./contexts/AuthContext"
import Authentication from "./pages/Authentication"
import LandingPage from "./pages/LandingPage"
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { VideoMeet } from "./pages/VideoMeet"
import Home from "./pages/Home"
import { History } from "./pages/history"
function App() {
  return (
    <>
      <Router>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<Authentication />} />
            <Route path="/home" element={<Home />} />
            <Route path="/:url" element={<VideoMeet />} />
            <Route path="/history" element={<History />} />
          </Routes>
        </AuthProvider>
      </Router>
    </>
  )
}
export default App
