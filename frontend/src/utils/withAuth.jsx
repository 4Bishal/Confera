import { useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom"
import { AuthContext } from "../contexts/AuthContext";

const withAuth = (WrappedComponent) => {
    const AuthComponent = (props) => {
        const router = useNavigate();

        const { authToken } = useContext(AuthContext);

        const isAuthenticated = async () => {
            if (localStorage.getItem("token")) {

                const localToken = localStorage.getItem("token");
                const actualToken = await authToken(localToken);
                if (localToken == actualToken)
                    return true;
                else
                    return false;
            }
            return false;
        }

        useEffect(() => {
            if (!isAuthenticated()) {
                router("/auth")
            }
        }, [])

        return <WrappedComponent {...props} />
    }

    return AuthComponent;
}

export default withAuth;