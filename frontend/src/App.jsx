import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import Login from "./Login";
import Dashboard from "./Dashboard";
import RandomCounting from "./RandomCounting";
import RandomCountingList from "./RandomCountingList";
import TaskView from "./TaskView";
import Reports from "./Reports";
import ViewTrain from "./ViewTrain";
import TrainEdit from "./TrainEdit";
import DispatchPage from "./DispatchPage";
import ReviewerVerify from "./ReviewerVerify";
import ReviewerDispatch from "./ReviewerDispatch";
import CameraList from "./CameraList";
import Profile from "./Profile";
import Alerts from "./Alerts";
import SessionTimeout from "./components/SessionTimeout";
import { checkSessionOnLoad } from "./utils/sessionUtils";

// Protected Route Component
function ProtectedRoute({ children }) {
  const [isValid, setIsValid] = useState(null);

  useEffect(() => {
    const valid = checkSessionOnLoad();
    setIsValid(valid);
  }, []);

  if (isValid === null) {
    return <div>Loading...</div>; // Or a loading spinner
  }

  if (!isValid) {
    return <Navigate to="/" replace />;
  }

  return <SessionTimeout>{children}</SessionTimeout>;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/random-counting" 
        element={
          <ProtectedRoute>
            <RandomCountingList />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/random-counting/inspect/:id" 
        element={
          <ProtectedRoute>
            <RandomCounting />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/random-counting/inspect" 
        element={
          <ProtectedRoute>
            <RandomCounting />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/task-view" 
        element={
          <ProtectedRoute>
            <TaskView />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/reports" 
        element={
          <ProtectedRoute>
            <Reports />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/view/:trainId" 
        element={
          <ProtectedRoute>
            <ViewTrain />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/train/:trainId/edit" 
        element={
          <ProtectedRoute>
            <TrainEdit />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/train/:trainId/dispatch" 
        element={
          <ProtectedRoute>
            <DispatchPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/reviewer/train/:trainId" 
        element={
          <ProtectedRoute>
            <ReviewerVerify />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/reviewer/train/:trainId/verify" 
        element={
          <ProtectedRoute>
            <ReviewerVerify />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/reviewer/train/:trainId/edit" 
        element={
          <ProtectedRoute>
            <ReviewerVerify />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/reviewer/train/:trainId/dispatch" 
        element={
          <ProtectedRoute>
            <ReviewerDispatch />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/cameras/:spur" 
        element={
          <ProtectedRoute>
            <CameraList />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile" 
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/alerts/:spur" 
        element={
          <ProtectedRoute>
            <Alerts />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
}

export default App;






