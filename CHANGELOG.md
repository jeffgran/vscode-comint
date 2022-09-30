# Change Log

All notable changes to the "comint" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Fix password prompt bug where it would show multiple times the first time a password prompt is encountered, 
  and then never work again after the first time. It was a regexp issue.
- Add `!suggestWidgetVisible` to when clause for `sendInput` so you can press enter to accept a suggestion if that's your thing.

## [0.0.2]

- Initial release. Highly experimental.

## [0.0.1]

- Never published, built and run locally during development/testing.