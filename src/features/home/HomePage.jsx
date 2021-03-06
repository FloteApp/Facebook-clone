import React from "react";

class HomePage extends React.Component {

  render() {
    return (
      <>
        <header className="bg" >
          <div className="slogan">
            <p>Планируйте встречи</p>
            <p>Приглашайте друзей</p>
            <p>Будьте счастливы</p>
            <div
              onClick={() => this.props.history.push("/events")}
              className="ui huge blue bacis inverted button"
            >
              Начать
              <i className="right arrow icon" />
            </div>
          </div>
        </header>
      </>
    );
  }
}

export default HomePage;
