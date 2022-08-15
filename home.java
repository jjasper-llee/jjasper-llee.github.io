Name:       Jasper Lee

Date:       3/1/22
Period:     5

Is this lab fully working?  Yes
Time taken: 1 hour
*/
import javafx.scene.paint.*;
import javafx.scene.shape.*;
import javafx.application.Application;
import javafx.scene.Group;
import javafx.scene.Scene;
import javafx.stage.Stage;

public class P5_Lee_Jasper_JavaFX_HW1 extends Application{
	private final double WORLD_W = 300;
	private final double WORLD_H = 300;
	
	private final double HEAD_RAD = 100;
	private final double HEAD_X = WORLD_W/2;
	private final double HEAD_Y = WORLD_H/2;
	private final Color HEAD_COLOR = Color.GREEN;
	
	private final double EYE_BROW_W = HEAD_RAD*2/7;
	private final double EYE_BROW_H = HEAD_RAD*6/70;
	private final Color EYE_BROW_COLOR = Color.BLACK;
	
	private final double EYE_RAD = HEAD_RAD / 10;
	private final double EYE_OFF_X = HEAD_RAD / 2;
	private final double EYE_OFF_Y = HEAD_RAD * 2/7;
	private final Color EYE_COLOR = Color.BLACK;
	
	private final double NOSE_OFF_X1 = HEAD_X; 
	private final double NOSE_OFF_Y1 = HEAD_RAD/7; 
	private final double NOSE_OFF_X2 = HEAD_RAD/7; 
	private final double NOSE_OFF_Y2 = HEAD_RAD/7;
	private final double NOSE_OFF_X3 = HEAD_RAD/100;
	private final double NOSE_OFF_Y3 = HEAD_RAD/7; 
	
	private final double MOUTH_OFF_X1 = HEAD_RAD/2; //115
	private final double MOUTH_OFF_Y1= HEAD_RAD/2; //185
	private final double MOUTH_OFF_X2 = HEAD_RAD*25/70; //125
	private final double MOUTH_OFF_Y2 = HEAD_RAD; //220
	private final double MOUTH_OFF_X3 = HEAD_RAD/2; //180
	private final double MOUTH_OFF_Y3 = HEAD_RAD; //220
	private final double MOUTH_OFF_X4 = HEAD_RAD*5/7; //200
	private final double MOUTH_OFF_Y4 = HEAD_RAD/7; //160
	private final Color MOUTH_COLOR = Color.WHITE;
	private final Color LIP_COLOR = Color.BLACK;
	
	
	public static void main(String[] args) {
		launch(args);
	}

	@Override
	public void start(Stage stage) throws Exception {
		
		Polygon nose = new Polygon();
		nose.getPoints().addAll(new Double[]{
				NOSE_OFF_X1, HEAD_Y - NOSE_OFF_Y1,
				HEAD_X - NOSE_OFF_X2, HEAD_Y + NOSE_OFF_Y2,
				HEAD_X + NOSE_OFF_X3, HEAD_Y + NOSE_OFF_Y3});
		
		Rectangle brow1 = new Rectangle(HEAD_X - HEAD_RAD/2, HEAD_Y - HEAD_RAD/2, EYE_BROW_W, EYE_BROW_H);
		brow1.setFill(EYE_BROW_COLOR);
		Rectangle brow2 = new Rectangle(HEAD_X + HEAD_RAD/2 - EYE_BROW_W/2, HEAD_Y - HEAD_RAD/2, EYE_BROW_W, EYE_BROW_H);
		brow2.setFill(EYE_BROW_COLOR);
		
		Circle face = new Circle(HEAD_X, HEAD_Y, HEAD_RAD);
		face.setFill(HEAD_COLOR);
		
		Circle eye1 = new Circle(HEAD_X - EYE_OFF_X, HEAD_Y - EYE_OFF_Y, EYE_RAD);
		eye1.setFill(EYE_COLOR);
		Circle eye2 = new Circle(HEAD_X + EYE_OFF_X - HEAD_RAD/7, HEAD_Y - EYE_OFF_Y, EYE_RAD);
		eye2.setFill(EYE_COLOR);
		
		CubicCurve mouth = new CubicCurve(HEAD_X - MOUTH_OFF_X1, HEAD_Y + MOUTH_OFF_Y1, HEAD_X - MOUTH_OFF_X2, HEAD_Y + MOUTH_OFF_Y2, HEAD_X + MOUTH_OFF_X3, HEAD_Y + MOUTH_OFF_Y3, HEAD_X + MOUTH_OFF_X4, HEAD_Y + MOUTH_OFF_Y4);
		mouth.setStroke(LIP_COLOR);
		mouth.setStrokeWidth(1);
		mouth.setFill(MOUTH_COLOR);
        
		Group root = new Group(face, nose, brow1, brow2, eye1, eye2, mouth);
		Scene scene = new Scene(root, WORLD_W, WORLD_H);
		stage.setScene(scene);
		stage.setTitle("Default window");
		stage.setResizable(false);
		stage.show();
		
	}
}
