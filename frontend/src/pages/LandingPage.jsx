import React, { useEffect, useState } from 'react'
import '../App.css'
import { Link, useNavigate } from 'react-router-dom'
const LandingPage = () => {

    const [randomRoomCode, setrandomRoomCode] = useState()
    useEffect(() => {
        setrandomRoomCode(parseInt(Math.random() * 1000))
    }, [])

    const routeTo = useNavigate();

    return (
        <div className='langingPageContainer'>
            <nav className='navigationBar'>
                <div className="logoName">Confera</div>
                <div className="navList">
                    <p onClick={() => {
                        routeTo(`/${randomRoomCode}`)
                    }}>Join as Guest</p>
                    <p ><Link to={"http://localhost:5173/auth"} style={{ textDecoration: "none", color: "white" }}>Register</Link></p>
                    <div role='button'><Link to={"http://localhost:5173/auth"} style={{ textDecoration: "none", color: "white" }}>Login</Link></div>
                </div>
            </nav>

            <div className="landingMainSection">
                <div className='leftSection'>
                    <h1><span style={{ color: "#FF9839" }}>Connect </span>with your love Ones</h1>
                    <p>Cover a distance with Confera</p>
                    <div role='button'>
                        <Link to={"http://localhost:5173/auth"}>Get Started</Link>
                    </div>
                </div>
                <div className="rightSection">
                    <img src="../public/mobile.png" alt="" />
                </div>
            </div>
        </div>
    )
}

export default LandingPage