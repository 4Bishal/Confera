import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import server from '../environment';
import '../App.css';

const LandingPage = () => {
    const [randomRoomCode, setRandomRoomCode] = useState('');
    const navigate = useNavigate();

    // Generate random room code on mount
    useEffect(() => {
        setRandomRoomCode(Math.floor(Math.random() * 1000));
    }, []);

    return (
        <div className="landingPageContainer">
            {/* Navigation */}
            <nav className="navigationBar">
                <div className="logoName">Confera</div>
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
                    <div>
                        <Link
                            to={`${server}/auth`}
                            style={{ textDecoration: 'none', color: 'white' }}
                        >
                            Login
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Main Landing Section */}
            <div className="landingMainSection">
                <div className="leftSection">
                    <h1>
                        <span style={{ color: '#FF9839' }}>Connect </span>with your loved ones
                    </h1>
                    <p>Cover the distance with Confera</p>
                    <div role="button">
                        <Link
                            to={`${server}/auth`}
                            style={{ textDecoration: 'none', color: 'white' }}
                        >
                            Get Started
                        </Link>
                    </div>
                </div>

                <div className="rightSection">
                    {/* Correct public folder reference */}
                    <img src="/mobile.png" alt="Mobile App Preview" />
                </div>
            </div>
        </div>
    );
};

export default LandingPage;
