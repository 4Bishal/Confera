import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'

import { AuthProvider } from "./contexts/AuthContext";

import LandingPage from "./pages/LandingPage";
import Authentication from "./pages/Authentication";
import Home from "./pages/Home";
import History from "./pages/History";
import { MeetingRoom } from "./pages/MeetingRoom";

// HOCs
import withAuth from "./utils/withAuth";
import withPublic from "./utils/withPublic";
import { PreviewMeeting } from './pages/PreviewMeeting';
import NotFound from './pages/NotFound';
import { VideoMeet } from './pages/VideoMeet';

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
          {/* <Route path="/previewMeeting/:meetingCode" element={<PreviewMeeting />} />
          <Route path="/meeting/:meetingCode" element={<MeetingRoom />} /> */}

          <Route path='/:meetingCode' element={<VideoMeet />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
