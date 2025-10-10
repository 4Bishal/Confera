import React, { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";

const withPublic = (Component) => {
    const PublicComponent = (props) => {
        const { userData, loading } = useContext(AuthContext);

        // While checking token, render nothing or a loader
        if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

        // If logged in, redirect to home
        if (userData) return <Navigate to="/home" replace />;

        // Logged out, render the page
        return <Component {...props} />;
    };

    return PublicComponent;
};

export default withPublic;
