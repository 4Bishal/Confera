import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../App.css';
import server from '../environment';

const LandingPage = () => {
    const [randomRoomCode, setRandomRoomCode] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        setRandomRoomCode(Math.floor(Math.random() * 1000)); // generate random room code
    }, []);

    return (
        <div className="landingPageContainer">
            {/* Navigation Bar */}
            <nav className="navigationBar">
                <div className="navHeader">
                    <h2>Confera</h2>
                </div>
                <div className="navList">
                    <p
                        onClick={() => navigate(`/${randomRoomCode}`)}
                        style={{ cursor: 'pointer' }}
                    >
                        Join as Guest
                    </p>
                    <p>
                        <Link
                            to={`${server}/auth`}
                            style={{ textDecoration: 'none', color: 'white' }}
                        >
                            Register
                        </Link>
                    </p>
                    <div
                        role="button"
                        onClick={() => navigate(`${server}/auth`)}
                        style={{ cursor: 'pointer' }}
                    >
                        <p>Login</p>
                    </div>
                </div>
            </nav>

            {/* Landing Main Section */}
            <div className="landingMainContainer">
                <div className="leftSection">
                    <h1>
                        <span style={{ color: '#FF9839' }}>Connect </span>with your loved ones
                    </h1>
                    <p>Cover the distance with Confera</p>
                    <div role="button">
                        <Link to={`${server}/auth`}>Get Started</Link>
                    </div>
                </div>

                <div className="rightSection">
                    {/* Correct reference for public folder */}
                    <img src="/mobile.png" alt="Mobile Preview" />
                </div>
            </div>
        </div>
    );
};

export default LandingPage;
