/* 
  Cody Stebbins
  INFO 343 B, Autumn 2012
  December 8th, 2012
  Final Project - Tune Guessr
*/

var // modules
    youtube,
    tuneGuesser,
    musix,

    ui,     // object   - cached jQuery objects of tuneGuesser user interface
    resize; // function - responsively resizes the height of the page

$(document).ready(function () {
  ui = {
    main: $("#main"),
    body: $("body"),
    navbar: $("#navbar"),
    searchPage: $("#search"),
    search: $("#search input"),
    quizPage: $("#quiz"),
    searchLoading: $("#search img"),
    questions: $("#questions"),
    video: $("#video"),
    timer: $("#timer"),
    score: $("#score"),
    next: $("#next"),
    quizLoading: $("#quiz img")
  };

  $(window).resize(resize);
  resize();

  ui.search.typeahead({
    source: tuneGuesser.typeahead,
    updater: tuneGuesser.search
  });

  ui.next.click(tuneGuesser.startQuiz);

  // browsers sometimes save form classes on refresh
  // this forces new state
  ui.search.removeClass("disabled");
});

resize = function () {
  ui.main.height(ui.body.height() - ui.navbar.height() - 150);
};

$.ajaxSetup({
  error: function (event, request, settings) {
    console.log(event);
    console.log(request);
    console.log(settings);
    alert("Fatal error. Please refresh your page.");
  }
});

// ---------------------------------------------
// Modules
// ---------------------------------------------

// handles the overall application transitions and state
tuneGuesser = (function () {
  var // public methods
      search,
      typeahead,
      startQuiz,

      // private methods
      createPossibleTracks,
      getPossibleTracks,
      quizAnswer,
      end,
      update,

      artists,           // array   - musixmatch artists matching user query
      typeaheadArtists,  // array   - artist name strings for typeahead
      artist,            // object  - musixmatch artist from user query
      tracks,            // array   - musixmatch of tracks about the selected artist
      possibleTracks,    // array   - four possible musixmatch track answers for quiz
      correctIndex,      // integer - index mapping to the track playing for the quiz in possibleTracks
      currentVideo,      // object  - youtube video of quiz playing video
      maxSecs,           // integer - maximum amount of seconds for the quiz
      timeout,           // integer - id of the setTimeout for ending the quiz
      timer,             // integer - id of the setInterval counting down for the quiz
      start;             // Date    - datetime when the quiz started

  // searches for known tracks by the given artist and starts the quiz with those tracks
  //
  // artist - string - user queried artist from musixmatch api
  search = function (artist) {
    artist = artists[typeaheadArtists.indexOf(artist)].artist;
    tracks = [];

    ui.searchLoading.show();
    ui.search.attr("disabled", "");
    musix.searchTrack({
      artist: artist,
      success: function (response) {
        $.each(response.message.body.track_list, function (index, result) {
          tracks.push(result.track);
        });
        startQuiz();
      }
    });
  };

  // retrieves an array of artists best matching the given query and processes them
  // with the given process callback
  //
  // query - string - given user query for artist
  // process - function - callback for handling the array of artists
  typeahead = function (query, process) {
    var artist;

    ui.searchLoading.show();
    musix.searchArtist({
      query: ui.search.val(),
      success: function (results) {
        artists = results;
        typeaheadArtists = [];

        $.each(artists, function (index, result) {
          typeaheadArtists.push(result.artist.artist_name);
        });

        process(typeaheadArtists);
        ui.searchLoading.hide();
      }
    });
  };

  // transitions the game into the quiz state with a new set of tracks
  startQuiz = function () {
    var track;

    // show loading ui
    ui.video.hide();
    ui.quizLoading.show();
    ui.next.addClass("disabled");
    ui.questions.children().remove();

    // sets correctIndex and possibleTracks
    getPossibleTracks();

    // restarts the game if there are less than four tracks left
    if (tracks.length <= 4) {
      alert("Congrats! You have mastered this artist. Click ok to try again with another artist");
      location.reload();
    }

    // load youtube video for correct track
    track = tracks[possibleTracks[correctIndex].trackNum];
    track.youtube = youtube.searchVideo({
      track: track.track_name,
      artist: track.artist_name,
      success: function (vid) {
        currentVideo = vid;

        // catch to ensure that videos shorter than 60 seconds
        // don't break the application
        if (currentVideo.seconds === 60) {
          maxSecs = currentVideo.seconds;
        } else {
          maxSecs = 60;
        }

        youtube.playVideo(vid, function () {
          // hide search
          ui.searchLoading.hide();
          ui.searchPage.hide();

          // show quiz
          ui.quizPage.show();
          ui.quizLoading.hide();
          createPossibleTracks();

          // setup timer
          start = new Date();
          timeout = setTimeout(function () {
            ui.timer.text("0");
            quizAnswer(-1);
          }, maxSecs * 1000);
          timer = setInterval(update, 0);
        });
      }
    });
  };

  // creates ui elements for each of the possible tracks
  createPossibleTracks = function () {
    $.each(possibleTracks, function (index, track) {
      track = tracks[track.trackNum];

      ui.questions.append($("<tr>")
        .append($("<td>").text(track.track_name)
        .click(function (event) {
          if (!timer) { // if quiz is not counting down
            return;
          }

          quizAnswer(index);
        })
      ));
    });
  };

  // processes the user answer for a quiz from given index
  //
  // index - integer - index mapping to a track in possibleTracks that
  //   the user clicked on
  quizAnswer = function (index) {
    var clicked;

    clicked = ui.questions.find("tr:eq(" + index + ")");

    if (index === correctIndex) {
      end(true);
      clicked.addClass("success");
    } else {
      // if an answer was clicked
      if (index !== -1) {
        clicked.addClass("error");
      }

      ui.questions.find("tr:eq(" + correctIndex + ")").addClass("success");
      end(false);
    }
  };

  // handles the end of a quiz based on the given win boolean representing
  // if the user won.
  //
  // win - boolean - true if the user won, false if the user lost
  end = function (win) {
    var diff;

    if (!timer) {
      return;
    }

    if (win) {
      tracks.splice([possibleTracks[correctIndex].trackNum], 1);
      diff = parseInt(ui.timer.text());
    } else {
      diff = -40;
    }

    clearInterval(timer);
    clearTimeout(timeout);
    timer = null;

    ui.next.removeClass("disabled");
    ui.video.show();
    ui.score.text(parseInt(ui.score.text()) + diff);
  };

  // updates the quiz components
  update = function () {
    ui.timer.text(Math.floor((maxSecs * 1000 -
      Math.abs(start - new Date())) / 1000));
  };

  // generates an array of track objects which contain a integer trackNum
  // coresponding to the index of the track data in tracks and a boolean
  // correct which determines if the track is the correct track.
  getPossibleTracks = function () {
    var tempTracks, trackNum;

    tempTracks = [];
    possibleTracks = [];

    while (true) {
      if (possibleTracks.length === tracks.length ||
          possibleTracks.length === 4) {
        break;
      }

      trackNum = Math.floor(Math.random() * tracks.length);
      if (tempTracks.indexOf(trackNum) === -1){
        tempTracks.push(trackNum);
        possibleTracks.push({
          trackNum: trackNum,
          correct: false
        });
      }
    }

    // randomly assign a correct track from the possible Tracks
    correctIndex = Math.floor(Math.random() * possibleTracks.length);
    possibleTracks[correctIndex].correct = true;
  };

  return {
    search: search,
    typeahead: typeahead,
    startQuiz: startQuiz
  };
})();

// wrapper around the youtube gdata api to provide concise js apis
// https://developers.google.com/youtube/2.0/developers_guide_protocol
youtube = (function () {
  var // public methods
      searchVideo,
      playVideo,

      // private methods
      get,
      getId,

      key, // string - unique developer key for youtube gdata api
      url; // string - youtube gdata api REST url

  key = "AI39si6ysgzKazokS6ch6VH88z3XbeOOxNrQV_WWIleoqC2s0TbKhmrY3xmbRAKYNhpL2VKNq-s8NBCwWZlK_1vvZULwR-GVFQ";
  url = "https://gdata.youtube.com/feeds/api/videos";

  // searches for a youtube video based on the given o.artist and o.track.
  // processes the resulting video with the given o.success
  //
  // o - object - object that accepts the following fields
  //   o.artist - string - artist name to be searched
  //   o.track - string - track name to be searched
  //   o.success - function - callback to process resulting video
  searchVideo = function (o) {
    $.ajax({
      url: url,
      dataType: 'jsonp',
      data: {
        alt: "json",
        racy: "include",
        q: o.artist + " - " + o.track,
        key: key
      },
      success: function (results) {
        var vid, result;

        result = results.feed.entry[0];
        vid = {};
        vid.id = getId(result);
        vid.url = result.link[0].href;
        vid.title = get(result.title);
        vid.seconds = parseInt(result.media$group.yt$duration.seconds);

        return o.success(vid);
      }
    });
  };

  // plays the given youtube video for the quiz and calls the
  // given success function upon the start of the youtube video
  //
  // video - object - youtube video to be played for the quiz
  // success - function - callback to handle the start of the video
  // return - object - YT.player object of the played youtube video
  playVideo = function (video, success) {
    var successRun;

    successRun = false;

    ui.video.children().remove();
    ui.video.append($("<div>").attr("id", "player"));
    return new YT.Player('player', {
      height: '390',
      width: '640',
      videoId: video.id,
      events: {
        onReady: function (event) {
          event.target.playVideo();
        },
        onStateChange: function (event) {
          if (event.data == YT.PlayerState.PLAYING && !successRun) {
            successRun = true;
            success();
          }
        },
        onError: function (event) {
          //alert("Youtube API failure! Attempting retry.");
          tuneGuesser.startQuiz();
        }
      }
    });
  };

  // retrieves the text from a youtube object field
  //
  // youtubeField - object - a field from a youtube object
  // return - string - text of the given youtubeField
  get = function (youtubeField) {
    return youtubeField.$t;
  };

  // retrieves the id from a youtube object
  //
  // video - object - youtube object containing the id to be retrieved
  // return - integer - id of the given video
  getId = function (video) {
    var idUrl;

    idUrl = get(video.id).split("/");
    return idUrl[idUrl.length - 1];
  };

  return {
    searchVideo: searchVideo,
    playVideo: playVideo
  };
})();

// wrapper around the musixmatch to provide concise js apis
// https://developer.musixmatch.com/
musix = (function () {
  var // public methods
      searchTrack,
      searchArtist,

      key,       // string - unique developer key for musixmatch api
      artistUrl, // string - artist search REST api url for musixmatch api
      trackUrl;  // string - track search REST api url for musixmatch api

  key = "f5e5a6a86f26a18706952a96999aa277";
  artistUrl = "//api.musixmatch.com/ws/1.1/artist.search";
  trackUrl = "//api.musixmatch.com/ws/1.1/track.search";


  // searches for artists based on the given o.query and processes the
  // resulting array of artists with the given o.success. if o.query
  // is null or "" then this function is not executed.
  //
  // o - object - object that accepts the following fields
  //   o.query - string - user query attempting to match an artist name
  //   o.success - function - callback to process resulting artists
  searchArtist = function (o) {
    if (!o.query || o.query === "") {
        return;
    }

    $.ajax({
      url: artistUrl,
      dataType: 'jsonp',
      data: {
        q_artist: o.query,
        page: 1,
        page_size: 10,
        apikey: key,
        format: "JSONP"
      },
      success: function (data) {
        return o.success(data.message.body.artist_list);
      }
    });
  };

  // searches for tracks based on the given o.artist and processes the
  // resulting array of tracks with the given o.success.
  //
  // o - object - object that accepts the following fields
  //   o.artist - object - musixmatch artist object of artist to be searched on for tracks
  //   o.success - function - callback to process resulting tracks
  searchTrack = function (o) {
    $.ajax({
      url: trackUrl,
      dataType: 'jsonp',
      data: {
        f_artist_id: o.artist.artist_id,
        page: 1,
        page_size: 100,
        apikey: key,
        format: "JSONP"
      },
      success: function (data) {
        return o.success(data);
      }
    });
  };

  return {
    searchArtist: searchArtist,
    searchTrack: searchTrack
  };
})();
