import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'

import { AuthProvider } from "./contexts/AuthContext";

import LandingPage from "./pages/LandingPage";
import Authentication from "./pages/Authentication";
import Home from "./pages/Home";
import History from "./pages/History";
import { VideoMeet } from "./pages/VideoMeet";

// HOCs
import withAuth from "./utils/withAuth";
import withPublic from "./utils/withPublic";

// Wrap components once
const PublicLanding = withPublic(LandingPage);
const PublicAuth = withPublic(Authentication);
const PrivateHome = withAuth(Home);
const PrivateHistory = withAuth(History);

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<PublicLanding />} />
          <Route path="/auth" element={<PublicAuth />} />

          {/* Private routes */}
          <Route path="/home" element={<PrivateHome />} />
          <Route path="/history" element={<PrivateHistory />} />

          {/* VideoMeet is public */}
          <Route path="/:url" element={<VideoMeet />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
