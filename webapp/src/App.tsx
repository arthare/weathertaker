import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Link,
  useParams
} from "react-router-dom";
import logo from './logo.svg';
import './App.scss';
import PageTestSubmit from './PageTestSubmit';

function App() {
  return (
    <Router>
      <div className="App">
        <div className="App-Content">
          App!
          <Link to="/test-submit">Test-Submit</Link>
          <Switch>
            <Route exact path="/" />
            <Route exact path="/test-submit" children={<PageTestSubmit />} />
          </Switch>
        </div>
      </div>
    </Router>
  );
}

export default App;
