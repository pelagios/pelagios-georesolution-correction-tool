define([], function() {
  
  return {
    
    /** The initialize event is broadcast when the application is ready to start **/
    INITIALIZE : 'initialize',
    
    /** Global shortcut to the ESC key event **/
    ESCAPE : 'escape',
    
    /** Toolbar: the user activated navigation mode **/
    SWITCH_TO_NAVIGATE : 'switchToNavigate',
    
    /** Toolbar: the users activated annotation mode **/
    SWITCH_TO_ANNOTATE : 'switchToAnnotate',
    
    /** Toolbar: set the map image brightness to a different value **/
    SET_BRIGHTNESS : 'setBrightness',
    
    /** Toolbar: set the map contrast brightness to a different value **/
    SET_CONTRAST : 'setContrast',
    
    /** Toolbar: the users toggled the signoff status **/
    TOGGLE_SIGNOFF: 'toggleSignOff',
    
    /** Callback event for signoff changes **/
    SIGNOFF_CALLBACK: 'signOffCallback',
    
    /** The users selected an annotation to edit **/
    EDIT_ANNOTATION : 'editAnnotation',

    /** The user created a new annotation **/
    ANNOTATION_CREATED : 'annotationCreated',
    
    /** The user updated an existing annotation **/
    ANNOTATION_UPDATED : 'annotationUpdated',
    
    /** The user deleted an annotation **/
    ANNOTATION_DELETED : 'annotationDeleted',
    
    /** Annotation editing was canceled **/
    ANNOTATION_EDIT_CANCELED : 'annotationEditCanceled',
    
    /** The mouse was moved over an annotation **/
    MOUSE_OVER_ANNOTATION : 'mouseOverAnnotation',
    
    /** The mouse was moved out of an annotation **/
    MOUSE_LEAVE_ANNOTATION : 'mouseLeaveAnnotation',
    
    /** The storage fetched the annotations from the server **/
    STORE_ANNOTATIONS_LOADED : 'annotationsLoaded',
    
    /** The storage encountered an error while saving a new annotation **/
    STORE_CREATE_ERROR : 'createError',
    
    /** The storage encounterd an error while saving an updated annotation **/
    STORE_UPDATE_ERROR : 'updateError',
    
    /** The storage encountered an error while deleting an annotation **/
    STORE_DELETE_ERROR : 'deleteError'
        
  };
    
});
