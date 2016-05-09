# resumalize
Visualize your resume!

##What is this

**Resumalize** is a way to visualize your resume in a clear and simple manner. There are numerous services available
online to build your resume, but I wanted something to embed on a site/blog and thus created it.

##How to use it

In order to visualize your resume, create a json with the proper structure with all your work/volunteering/learning
experiences and provide it to the resumalize builder along the DOM container you want it to display in.

##JSON structure

The json is an object that consists of 2 main blocks: `work` and `learning` properties.

Both `work` and `learning` properties hold an array of objects.

###`work` array's object structure

```json
{
  "type": "paidJob|volunteering",
  "dateStart": "YYYY-MM-DD",
  "dateEnd": "YYYY-MM-DD|-",  // Use a dash to indicate you are currently work/volunteer there
  "place": "Company name",
  "title": "Your title",
  "keyFigures": ["1200+ hours of training", "1800+ people trained"],  // (optional) These will appear in popup on mousemove.
  "responsibilities": [
    {
      "title": "Short description of responsibility",
      "description": "Long description of your responsibility",
      "tech": [  // (optional)
        "python": ["django", "django-rest-framework"],
        "javascript": ["angularjs", "jquery", "d3.js"],
        "postgresq": []
      ],
      "achievements": ["a", "list", "of", "your", "achievements"],
      "type": "tech|non-tech",  // currently not used
      "problemsAddressed": ["revenue generation", "talent development"],
      "dateStart": "YYYY-MM-DD",
      "dateEnd": "YYYY-MM-DD|-",  // Use a dash to indicate you are currently work/volunteer there

    }
  ]
}
```
The `tech` property is an object that consists of "major" technologies which in their turn consist of a list of "derivative"
technologies, such as frameworks or libraries. Currently the `tech`s aren't displayed anywhere - this is one of the items on the TODO list.


###`work` array's object structure

```json
{
  "type": "face2face|online",
  "dateStart": "YYYY-MM-DD",
  "dateEnd": "YYYY-MM-DD|-",  // Use a dash to indicate you are currently studying there
  "place": "University/School name",
  "title": "Your title",
  "specialty": "Your specialty"  // (optional) It will appear in popup on mousemove.
}
```

##TODO list

- add a chart that will visualize the known technologies and the period when the user started working with them;
- visualize details in the slope chart on mouseover on the chart labels;
- improve corner rounding functionality to account for more complex shapes;