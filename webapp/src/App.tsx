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
import PageIndex from './PageIndex';

function App() {
  return (
    <Router>
      <div className="App">
        <div className="App-Content">
          <Switch>
            <Route exact path="/" children={<PageIndex />} />
            <Route exact path="/location/:handle" children={<PageIndex />} />
            <Route exact path="/test-submit" children={<PageTestSubmit />} />
          </Switch>
        </div>
      </div>
    </Router>
  );
}

export default App;
