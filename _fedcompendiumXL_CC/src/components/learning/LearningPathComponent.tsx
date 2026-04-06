import React, { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Text,
  Button,
  VStack,
  HStack,
  Stack,
  Flex,
  Badge,
  Card,
  CardBody,
  CardFooter,
  Divider,
  Progress,
  Spinner,
  useColorModeValue,
  Container,
  Tag,
  Step,
  StepDescription,
  StepIcon,
  StepIndicator,
  StepNumber,
  StepSeparator,
  StepStatus,
  StepTitle,
  Stepper,
  List,
  ListItem,
  ListIcon,
  useToast,
  IconButton
} from '@chakra-ui/react';
import { 
  ChevronRightIcon, 
  CheckCircleIcon, 
  TimeIcon, 
  InfoIcon, 
  EditIcon 
} from '@chakra-ui/icons';
import { FiBook, FiCode, FiPlay, FiCheckCircle } from 'react-icons/fi';
import { IconType } from 'react-icons';

// Define path step interface
interface PathStep {
  id: number;
  title: string;
  description: string;
  topicIds: string[];  // References to topics in topics.json
  requiredReading: string[];
  exercises: Exercise[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: number; // In minutes
  category: 'basics' | 'algorithms' | 'privacy' | 'systems' | 'applications';
}

interface Exercise {
  id: string;
  title: string;
  type: 'quiz' | 'coding' | 'simulation';
  description: string;
  completed?: boolean;
}

// Define learning path interface
interface LearningPath {
  id: string;
  title: string;
  description: string;
  steps: PathStep[];
  prerequisites: string[];
}

// Mock data - in a real app, this would come from an API or JSON file
const fedLearningPath: LearningPath = {
  id: 'fl-fundamentals',
  title: 'Federated Learning Fundamentals',
  description: 'A guided path through the core concepts of federated learning, from basic principles to practical implementations.',
  prerequisites: ['Basic machine learning knowledge', 'Python programming'],
  steps: [
    {
      id: 1,
      title: 'Introduction to Federated Learning',
      description: 'Learn the fundamentals of federated learning and how it differs from traditional centralized machine learning approaches.',
      topicIds: ['intro-fl'],
      requiredReading: ['Federated Learning: Basic Concepts'],
      exercises: [
        {
          id: 'quiz-fl-basics',
          title: 'Federated Learning Basics Quiz',
          type: 'quiz',
          description: 'Test your understanding of federated learning fundamentals',
          completed: true
        }
      ],
      difficulty: 'beginner',
      estimatedTime: 60,
      category: 'basics'
    },
    {
      id: 2,
      title: 'Federated Averaging (FedAvg)',
      description: 'Understand the canonical federated averaging algorithm, its implementation details and convergence properties.',
      topicIds: ['fedavg'],
      requiredReading: ['McMahan et al. (2017): Communication-Efficient Learning of Deep Networks from Decentralized Data'],
      exercises: [
        {
          id: 'sim-fedavg',
          title: 'FedAvg Simulation',
          type: 'simulation',
          description: 'Run a simulation of the FedAvg algorithm on MNIST dataset',
          completed: true
        },
        {
          id: 'code-fedavg',
          title: 'Implement FedAvg',
          type: 'coding',
          description: 'Implement the FedAvg algorithm using PyTorch',
          completed: false
        }
      ],
      difficulty: 'beginner',
      estimatedTime: 120,
      category: 'algorithms'
    },
    {
      id: 3,
      title: 'Dealing with Non-IID Data',
      description: 'Explore techniques for handling statistical heterogeneity in federated networks and improving model convergence.',
      topicIds: ['non-iid'],
      requiredReading: ['Zhao et al. (2018): Federated Learning with Non-IID Data'],
      exercises: [
        {
          id: 'sim-non-iid',
          title: 'Non-IID Effects Simulation',
          type: 'simulation',
          description: 'Explore the effects of data heterogeneity on model convergence',
          completed: false
        }
      ],
      difficulty: 'intermediate',
      estimatedTime: 180,
      category: 'algorithms'
    },
    {
      id: 4,
      title: 'Differential Privacy in Federated Learning',
      description: 'Learn how to implement differential privacy mechanisms to provide formal privacy guarantees in federated systems.',
      topicIds: ['diff-privacy'],
      requiredReading: ['Dwork (2006): Differential Privacy', 'Geyer et al. (2017): Differentially Private Federated Learning'],
      exercises: [
        {
          id: 'quiz-dp',
          title: 'Differential Privacy Quiz',
          type: 'quiz',
          description: 'Test your understanding of differential privacy concepts',
          completed: false
        },
        {
          id: 'code-dp-fl',
          title: 'Implement DP-FedAvg',
          type: 'coding',
          description: 'Add differential privacy to FedAvg algorithm',
          completed: false
        }
      ],
      difficulty: 'advanced',
      estimatedTime: 240,
      category: 'privacy'
    },
    {
      id: 5,
      title: 'Federated Learning on Edge Devices',
      description: 'Implement federated learning on resource-constrained IoT and edge devices with communication efficiency.',
      topicIds: ['fl-edge'],
      requiredReading: ['Bonawitz et al. (2019): Towards Federated Learning at Scale: System Design'],
      exercises: [
        {
          id: 'sim-fl-edge',
          title: 'Edge Device Simulation',
          type: 'simulation',
          description: 'Simulate federated learning on constrained edge devices',
          completed: false
        }
      ],
      difficulty: 'intermediate',
      estimatedTime: 150,
      category: 'systems'
    },
    {
      id: 6,
      title: 'Federated Learning for Healthcare',
      description: 'Explore applications of federated learning in healthcare, including FHIR integration and regulatory considerations.',
      topicIds: ['fl-healthcare'],
      requiredReading: ['Rieke et al. (2020): The Future of Digital Health with Federated Learning'],
      exercises: [
        {
          id: 'case-study-healthcare',
          title: 'Healthcare FL Case Study',
          type: 'quiz',
          description: 'Analyze a real-world healthcare federated learning application',
          completed: false
        }
      ],
      difficulty: 'intermediate',
      estimatedTime: 120,
      category: 'applications'
    }
  ]
};

// Calculate progress for a step
const calculateStepProgress = (step: PathStep): number => {
  if (!step.exercises || step.exercises.length === 0) return 0;
  
  const completed = step.exercises.filter(ex => ex.completed).length;
  return Math.round((completed / step.exercises.length) * 100);
};

// Calculate overall progress for the learning path
const calculatePathProgress = (path: LearningPath): number => {
  let totalExercises = 0;
  let completedExercises = 0;
  
  path.steps.forEach(step => {
    totalExercises += step.exercises.length;
    completedExercises += step.exercises.filter(ex => ex.completed).length;
  });
  
  return totalExercises > 0 ? Math.round((completedExercises / totalExercises) * 100) : 0;
};

// Get difficulty color
const getDifficultyColor = (difficulty: string): string => {
  switch(difficulty) {
    case 'beginner':
      return 'green';
    case 'intermediate':
      return 'orange';
    case 'advanced':
      return 'red';
    default:
      return 'gray';
  }
};

// Get category icon
const getCategoryIcon = (category: string) => {
  switch(category) {
    case 'basics':
      return InfoIcon;
    case 'algorithms':
      return EditIcon;
    case 'privacy':
      return TimeIcon;
    default:
      return ChevronRightIcon;
  }
};

// Create a mapping for exercise icons
const exerciseIcons = {
  quiz: FiBook,
  coding: FiCode,
  simulation: FiPlay,
  default: FiBook
};

const LearningPathComponent: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [path, setPath] = useState<LearningPath>(fedLearningPath);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  
  const cardBackground = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const hoverBg = useColorModeValue('gray.50', 'gray.700');

  // In a real app, you would fetch the learning path data here
  useEffect(() => {
    // Simulating data fetch
    setLoading(true);
    setTimeout(() => {
      setPath(fedLearningPath);
      setLoading(false);
    }, 800);
  }, []);

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleComplete = (stepId: number, exerciseId: string) => {
    setPath(prevPath => {
      const newPath = {...prevPath};
      const stepIndex = newPath.steps.findIndex(s => s.id === stepId);
      
      if (stepIndex >= 0) {
        const exerciseIndex = newPath.steps[stepIndex].exercises.findIndex(e => e.id === exerciseId);
        
        if (exerciseIndex >= 0) {
          const newStatus = !newPath.steps[stepIndex].exercises[exerciseIndex].completed;
          newPath.steps[stepIndex].exercises[exerciseIndex].completed = newStatus;
          
          toast({
            title: newStatus ? "Exercise completed" : "Exercise marked as incomplete",
            status: newStatus ? "success" : "info",
            duration: 2000,
            isClosable: true,
          });
        }
      }
      
      return newPath;
    });
  };

  const handleReset = () => {
    setActiveStep(0);
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="50vh">
        <Spinner size="xl" thickness="4px" speed="0.65s" color="blue.500" />
      </Flex>
    );
  }

  const overallProgress = calculatePathProgress(path);

  return (
    <Container maxW="container.xl" p={5}>
      <Card mb={6} variant="outline" p={5}>
        <Heading as="h1" size="xl" mb={2}>
          {path.title}
        </Heading>
        
        <Text mb={4} fontSize="md">
          {path.description}
        </Text>
        
        <Box mb={4}>
          <Heading as="h3" size="sm" mb={2}>
            Prerequisites:
          </Heading>
          <HStack spacing={2} wrap="wrap">
            {path.prerequisites.map((prereq, index) => (
              <Tag key={index} size="md" colorScheme="blue" variant="subtle">
                {prereq}
              </Tag>
            ))}
          </HStack>
        </Box>
        
        <Box mb={3}>
          <Heading as="h3" size="sm" mb={2}>
            Overall Progress: {overallProgress}%
          </Heading>
          <Progress 
            value={overallProgress} 
            size="md" 
            colorScheme="blue" 
            borderRadius="md"
            hasStripe={overallProgress > 0}
            isAnimated={overallProgress > 0}
          />
        </Box>
      </Card>

      <Stepper index={activeStep} orientation="vertical" height="auto" gap="0">
        {path.steps.map((step, index) => {
          const stepProgress = calculateStepProgress(step);
          const isActive = index === activeStep;
          const isCompleted = index < activeStep;
          
          return (
            <Step key={step.id}>
              <StepIndicator>
                <StepStatus 
                  complete={<StepIcon />} 
                  incomplete={<StepNumber />} 
                  active={<StepNumber />} 
                />
              </StepIndicator>

              <Box flexShrink="0">
                <StepTitle>
                  <HStack spacing={2} mb={1}>
                    <Heading size="md">{step.title}</Heading>
                    <Badge 
                      colorScheme={getDifficultyColor(step.difficulty)}
                      variant="subtle"
                    >
                      {step.difficulty}
                    </Badge>
                    <Badge variant="outline">{step.category}</Badge>
                  </HStack>
                  
                  {stepProgress > 0 && (
                    <HStack spacing={2} mt={1}>
                      <Text fontSize="sm">{stepProgress}% complete</Text>
                      <Progress 
                        value={stepProgress} 
                        size="xs" 
                        width="100px" 
                        colorScheme="green" 
                      />
                    </HStack>
                  )}
                </StepTitle>
                
                <StepDescription>
                  <Box mt={2} mb={isActive ? 4 : 0}>
                    <Text>{step.description}</Text>
                    <Text fontSize="sm" color="gray.500" mt={1}>
                      Estimated time: {step.estimatedTime} minutes
                    </Text>
                  </Box>
                  
                  {isActive && (
                    <Box mt={4}>
                      <Divider my={4} />
                      
                      <Heading as="h4" size="sm" mb={3}>
                        Required Reading:
                      </Heading>
                      <List spacing={1} mb={4}>
                        {step.requiredReading.map((reading, readingIndex) => (
                          <ListItem key={readingIndex}>
                            <ListIcon as={FiBook as React.ElementType} color="blue.500" />
                            {reading}
                          </ListItem>
                        ))}
                      </List>
                      
                      <Heading as="h4" size="sm" mb={3}>
                        Exercises:
                      </Heading>
                      <Stack spacing={3} mb={6} direction={["column", "column", "row"]} wrap="wrap">
                        {step.exercises.map((exercise) => {
                          // Get the icon type based on exercise type
                          const IconComponent = exerciseIcons[exercise.type] || exerciseIcons.default;
                          
                          return (
                            <Card 
                              key={exercise.id} 
                              width={["100%", "100%", "48%"]}
                              variant="outline" 
                              bg={cardBackground}
                              borderColor={borderColor}
                              _hover={{ borderColor: "blue.400", shadow: "md" }}
                              transition="all 0.2s"
                            >
                              <CardBody>
                                <Flex justify="space-between" mb={2}>
                                  <Heading size="sm">
                                    {exercise.title}
                                  </Heading>
                                  <Badge 
                                    colorScheme={
                                      exercise.type === 'quiz' ? 'blue' : 
                                      exercise.type === 'coding' ? 'purple' : 'green'
                                    }
                                  >
                                    {exercise.type}
                                  </Badge>
                                </Flex>
                                <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
                                  {exercise.description}
                                </Text>
                              </CardBody>
                              <CardFooter pt={0}>
                                <Flex justify="space-between" w="100%">
                                  <Button 
                                    leftIcon={<Box as={IconComponent as React.ElementType} />}
                                    size="sm" 
                                    variant="outline"
                                    colorScheme="blue"
                                  >
                                    Start
                                  </Button>
                                  <Button
                                    size="sm"
                                    colorScheme={exercise.completed ? "green" : "gray"}
                                    variant={exercise.completed ? "solid" : "outline"}
                                    leftIcon={
                                      exercise.completed ? 
                                      <Box as={FiCheckCircle as React.ElementType} /> : 
                                      undefined
                                    }
                                    onClick={() => handleComplete(step.id, exercise.id)}
                                  >
                                    {exercise.completed ? "Completed" : "Mark Complete"}
                                  </Button>
                                </Flex>
                              </CardFooter>
                            </Card>
                          );
                        })}
                      </Stack>
                      
                      <HStack spacing={2} mt={4}>
                        <Button
                          isDisabled={index === 0}
                          onClick={handleBack}
                          variant="outline"
                        >
                          Back
                        </Button>
                        <Button
                          colorScheme="blue"
                          onClick={handleNext}
                        >
                          {index === path.steps.length - 1 ? 'Finish' : 'Continue'}
                        </Button>
                      </HStack>
                    </Box>
                  )}
                </StepDescription>
              </Box>

              <StepSeparator />
            </Step>
          );
        })}
      </Stepper>
      
      {activeStep === path.steps.length && (
        <Card p={6} mt={6} textAlign="center" variant="outline">
          <Heading size="lg" mb={3}>
            🎉 Congratulations!
          </Heading>
          <Text fontSize="lg" mb={4}>
            You've completed the {path.title} learning path.
          </Text>
          <Text mb={6}>
            You now have a solid understanding of the fundamentals of federated learning, from basic concepts to practical implementations.
          </Text>
          <HStack spacing={4} justify="center">
            <Button 
              onClick={handleReset} 
              variant="outline"
            >
              Restart Path
            </Button>
            <Button 
              colorScheme="blue"
            >
              Get Certificate
            </Button>
          </HStack>
        </Card>
      )}
    </Container>
  );
};

export default LearningPathComponent;